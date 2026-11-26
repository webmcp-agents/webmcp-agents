/**
 * Configuration as data: where spans go (design §7.2, first match wins), each OTLP target's URL, protocol, headers and
 * timeout from its options and the standard `OTEL_*` variables, sampling and the resource. Pure: no package is loaded
 * and nothing is printed here (callers pass `warn` for what must be logged).
 */
import type { OtlpTarget, Sampling, SpanExporter, SpanProcessor, TracerProviderOption } from "../shared/types";

/** Environment variables, as `process.env` holds them. */
export type Env = Record<string, string | undefined>;

/** The three wire formats. */
export const PROTOCOLS = ["http/json", "http/protobuf", "grpc"] as const;
/** One of {@link PROTOCOLS}. */
export type Protocol = (typeof PROTOCOLS)[number];

/** Default export timeout, ms (OTel's own default for `OTEL_EXPORTER_OTLP_TIMEOUT`). */
export const DEFAULT_TIMEOUT = 30_000;

const lower = (v: string | undefined): string => (v ?? "").trim().toLowerCase();

/**
 * `OTEL_SDK_DISABLED=true` (everything off, the relay drops) or `WEB_AGENTS_OTEL_ENABLED=false` (only this library).
 * Returns which, or undefined when neither is set.
 */
export function killSwitch(env: Env): "OTEL_SDK_DISABLED" | "WEB_AGENTS_OTEL_ENABLED" | undefined {
  if (lower(env.OTEL_SDK_DISABLED) === "true") return "OTEL_SDK_DISABLED";
  if (lower(env.WEB_AGENTS_OTEL_ENABLED) === "false") return "WEB_AGENTS_OTEL_ENABLED";
  return undefined;
}

/**
 * `k=v,k2=v2` (OTel's list format: values percent-decoded, spaces trimmed). An entry with no `=` or an empty key is
 * skipped and reported to `bad`; the others are kept.
 */
export function parseList(raw: string | undefined, bad: (entry: string) => void = () => {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of (raw ?? "").split(",")) {
    if (!entry.trim()) continue;
    const at = entry.indexOf("=");
    const key = at > 0 ? entry.slice(0, at).trim() : "";
    if (!key) {
      bad(entry.trim());
      continue;
    }
    const value = entry.slice(at + 1).trim();
    try {
      out[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      bad(entry.trim());
    }
  }
  return out;
}

/** What an OTLP target resolves to, ready for an exporter. */
export interface ResolvedTarget {
  url: string;
  protocol: Protocol;
  headers: Record<string, string>;
  timeout: number;
}

/** The base URL with `/v1/traces` appended (OTel: relative to the base, one slash). */
const withTracesPath = (base: string): string => `${base.replace(/\/+$/, "")}/v1/traces`;

const positive = (v: string | number | undefined): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * One OTLP target from its options, then the env: `endpoints.traces` (as given) › `endpoint` (+ `/v1/traces`) ›
 * `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (as given) › `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `/v1/traces`). For `grpc` a base
 * endpoint is used as given. An error string when it cannot be used: both endpoint forms, an unknown protocol, no URL.
 */
export function resolveOtlp(target: OtlpTarget, env: Env, bad: (header: string) => void = () => {}): ResolvedTarget | { error: string } {
  if (target.endpoint && target.endpoints)
    return {
      error: "an OTLP target has both `endpoint` and `endpoints`: give one (`endpoint` is a base URL, `endpoints.traces` an exact one)",
    };
  const raw = target.protocol ?? (lower(env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL) || lower(env.OTEL_EXPORTER_OTLP_PROTOCOL) || "http/json");
  if (!(PROTOCOLS as readonly string[]).includes(raw))
    return { error: `unknown OTLP protocol "${raw}": use one of "http/json", "http/protobuf" or "grpc"` };
  const protocol = raw as Protocol;
  const base = (url: string): string => (protocol === "grpc" ? url : withTracesPath(url));
  const fromEnv = !target.endpoints?.traces && !target.endpoint;
  const url =
    target.endpoints?.traces ??
    (target.endpoint ? base(target.endpoint) : undefined) ??
    (env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() || undefined) ??
    (env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() ? base(env.OTEL_EXPORTER_OTLP_ENDPOINT.trim()) : undefined);
  if (!url) return { error: "an OTLP target has no URL: give it `endpoint` or set OTEL_EXPORTER_OTLP_ENDPOINT" };
  try {
    new URL(url);
  } catch {
    if (protocol !== "grpc") return { error: "an OTLP target's URL is not a valid URL" };
  }
  return {
    url,
    protocol,
    // the env's headers go only where the env's URL goes: a vendor key in OTEL_EXPORTER_OTLP_HEADERS must never reach
    // a target that names its own endpoint (another backend)
    headers: {
      ...(fromEnv && parseList(env.OTEL_EXPORTER_OTLP_HEADERS, bad)),
      ...(fromEnv && parseList(env.OTEL_EXPORTER_OTLP_TRACES_HEADERS, bad)),
      ...target.headers,
    },
    timeout:
      positive(target.timeout) ??
      positive(env.OTEL_EXPORTER_OTLP_TRACES_TIMEOUT) ??
      positive(env.OTEL_EXPORTER_OTLP_TIMEOUT) ??
      DEFAULT_TIMEOUT,
  };
}

/**
 * Where the env alone sends spans: the URL, or `"off"` (no endpoint variable, a kill switch, or a target that cannot
 * be used). The design's table (§7.2) as a function.
 *
 * @example
 * resolveTarget({}, { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" }) // "https://c.example/v1/traces"
 */
export function resolveTarget(target: OtlpTarget, env: Env): string {
  if (killSwitch(env)) return "off";
  const r = resolveOtlp(target, env);
  return "error" in r ? "off" : r.url;
}

/** How spans leave: not at all, a provider passed in, a private one built here, or the app's global one. */
export type Mode = "off" | "provider" | "private" | "global";

/** The fields of the config resolution reads. */
export interface ModeInput {
  tracerProvider?: TracerProviderOption;
  exporters?: readonly (OtlpTarget | SpanExporter)[];
  spanProcessors?: readonly SpanProcessor[];
}

/** Why the mode is `"off"`, for the one line that says so. */
export type OffReason = "kill-switch" | "nothing-configured" | "no-global-provider";

/**
 * §7.2, first match wins: a kill switch › `tracerProvider` instance › `"global"` (required) › `exporters` /
 * `spanProcessors` › a registered global provider (unless `"own"`) › an endpoint variable › off.
 */
export function resolveMode(config: ModeInput, env: Env, globalRegistered: boolean): { mode: Mode; off?: OffReason } {
  if (killSwitch(env)) return { mode: "off", off: "kill-switch" };
  const provider = config.tracerProvider;
  if (provider && typeof provider === "object") return { mode: "provider" };
  if (provider === "global") return globalRegistered ? { mode: "global" } : { mode: "off", off: "no-global-provider" };
  if (config.exporters?.length || config.spanProcessors?.length) return { mode: "private" };
  if (provider !== "own" && globalRegistered) return { mode: "global" };
  if (env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() || env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) return { mode: "private" };
  return { mode: "off", off: "nothing-configured" };
}

/**
 * Sampling from `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG`: `always_on`, `always_off`, `traceidratio`, and
 * their `parentbased_*` forms read as the same (the browser's sampled flag is not trusted: the server decides).
 * Undefined when unset; `bad` hears of an unknown sampler or a ratio that is not a number from 0 to 1.
 */
export function samplingFromEnv(env: Env, bad: (message: string) => void = () => {}): Sampling | undefined {
  const name = lower(env.OTEL_TRACES_SAMPLER).replace(/^parentbased_/, "");
  if (!name) return undefined;
  if (name === "always_on") return { type: "always" };
  if (name === "always_off") return { type: "never" };
  if (name === "traceidratio") {
    const arg = env.OTEL_TRACES_SAMPLER_ARG?.trim();
    const p = arg ? Number(arg) : 1;
    if (!(p >= 0 && p <= 1)) {
      bad(`OTEL_TRACES_SAMPLER_ARG "${arg}" is not a number from 0 to 1: every trace is sampled`);
      return { type: "always" };
    }
    return { type: "ratio", probability: p };
  }
  bad(`unknown OTEL_TRACES_SAMPLER "${env.OTEL_TRACES_SAMPLER}": use always_on, always_off or traceidratio. Every trace is sampled`);
  return undefined;
}

/**
 * The resource's attributes: `OTEL_RESOURCE_ATTRIBUTES`, then `OTEL_SERVICE_NAME`, then the options (`resourceAttributes`,
 * then `serviceName`); `service.name` defaults to `"web-agents"`.
 */
export function resourceAttributes(
  options: { serviceName?: string; resourceAttributes?: Record<string, string> },
  env: Env,
  bad: (entry: string) => void = () => {},
): Record<string, string> {
  const out = parseList(env.OTEL_RESOURCE_ATTRIBUTES, bad);
  if (env.OTEL_SERVICE_NAME?.trim()) out["service.name"] = env.OTEL_SERVICE_NAME.trim();
  Object.assign(out, options.resourceAttributes);
  if (options.serviceName) out["service.name"] = options.serviceName;
  out["service.name"] ||= "web-agents";
  return out;
}
