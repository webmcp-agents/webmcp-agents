/**
 * `defineObservability()` and `otlp()`: the chat handler's observability layer (design §7.3, §7.4). Lazy: nothing is
 * loaded and nothing is sent until the first request, and every fault (a missing package, bad env, a failing
 * exporter) is logged once and turns only the affected part off. A chat request's outcome and timing never depend on it.
 */
import { type ChatRequestContext, validTraceparent } from "@webmcp-agents/chat/server";
import { createRedactor, getRedactor, type Redactor } from "@webmcp-agents/core/redact";
import type { OtlpTarget, SpanExporter } from "../shared/types";
import { killSwitch, resolveMode } from "./config";
import { createLog } from "./log";
import { createRelay } from "./relay";
import { buildRuntime, globalProvider, type Runtime, timeoutOf } from "./runtime";
import type { Observability, ObservabilityConfig } from "./types";

/** The chat's `ChatObservability.exportTimeoutMs` default (how long the handler waits for a flush). */
const DEFAULT_FLUSH_CAP = 5000;

/** The globally registered AI SDK integrations (`registerTelemetry`): read, never written (decision 4). */
const appIntegrations = (): unknown[] => {
  const list = (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown }).AI_SDK_TELEMETRY_INTEGRATIONS;
  return Array.isArray(list) ? list : [];
};

/**
 * The observability layer for `createChatHandler({ observability })`: every model step as an OpenTelemetry span,
 * with the run's ids, joined to the browser's run through its `traceparent`. Where spans go, first match wins: a
 * `tracerProvider` passed in › `exporters` / `spanProcessors` › a tracer provider the app registered (Sentry,
 * `@vercel/otel`, the OpenTelemetry SDK) › `OTEL_EXPORTER_OTLP_ENDPOINT` › off. It never registers anything globally.
 * `relay()` is the endpoint for the browser's spans.
 *
 * Needs `@opentelemetry/api` and `@ai-sdk/otel` installed (and `@opentelemetry/sdk-trace` unless the app has its own
 * provider); without them it is off, with one line saying which to install.
 *
 * @experimental
 *
 * @example
 * // app/api/chat/route.ts: everything else is OTEL_* env
 * export const POST = createChatHandler({ agents, observability: defineObservability() });
 */
export function defineObservability(config: ObservabilityConfig = {}): Observability {
  const env = config.env ?? (typeof process !== "undefined" ? process.env : {});
  const log = createLog();
  const own: Redactor | false | undefined =
    config.redact === false ? false : typeof config.redact === "function" ? config.redact : config.redact && createRedactor(config.redact);
  const redactor = (): Redactor | false => own ?? getRedactor();
  const text = (s: string): string => {
    const r = redactor();
    return r ? r.text(s) : s;
  };

  // ---------- built on first use, never at import ----------
  let built: Runtime | null | undefined;
  let ready: Promise<Runtime | null> | undefined;
  const runtime = (): Promise<Runtime | null> =>
    (ready ??= buildRuntime(config, env, log, redactor).then(
      (rt) => {
        built = rt;
        return rt;
      },
      (err: unknown) => {
        log.error("build", "telemetry is off: it could not be set up. The chat is unaffected", err);
        built = null;
        return null;
      },
    ));

  const timeouts = (config.exporters ?? []).filter((x): x is OtlpTarget => typeof (x as SpanExporter).export !== "function");
  const exportTimeoutMs = Math.max(DEFAULT_FLUSH_CAP, ...timeouts.map((t) => timeoutOf(t, env)), killSwitch(env) ? 0 : timeoutOf({}, env));

  /** Never rejects; settles within `exportTimeoutMs` at the latest. */
  const settle = (work: (rt: Runtime) => Promise<void>): Promise<void> =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, exportTimeoutMs);
      (timer as { unref?: () => void }).unref?.();
      runtime()
        .then((rt) => (rt ? work(rt) : undefined))
        .catch((err: unknown) => log.error("flush", "a flush failed; spans may be lost (the chat is unaffected)", err))
        .finally(() => {
          clearTimeout(timer);
          resolve();
        });
    });

  return {
    get enabled() {
      if (built !== undefined) return built !== null;
      return resolveMode(config, env, !!globalProvider(undefined)).mode !== "off";
    },
    exportTimeoutMs,
    telemetry(ctx: ChatRequestContext) {
      const rt = built;
      // not built (withContext builds it first) or off: leave the handler's settings, and the app's own integrations, alone
      if (!rt) return {};
      const sampled = rt.sampled(ctx);
      return {
        // per-call integrations replace the registered ones for that call (ai@7): pass the app's along with ours
        integrations: [...appIntegrations(), ...(sampled ? rt.integrations(ctx) : [])] as never,
        recordInputs: config.recordInputs ?? false,
        recordOutputs: config.recordOutputs ?? false,
      };
    },
    async withContext(req, run) {
      const rt = await runtime();
      if (!rt) return run();
      const go = () => rt.withParent(validTraceparent(req.headers.get("traceparent")) ?? null, run);
      return rt.requests ? rt.requests.run(req, go) : go();
    },
    flush: () => settle((rt) => rt.flush()),
    shutdown: () => settle((rt) => rt.shutdown()),
    relay: (options) => createRelay({ runtime, text, flush: () => settle((rt) => rt.flush()), log }, options),
  };
}

/**
 * An OTLP target. Fields left out fall back to the `OTEL_EXPORTER_OTLP_*` variables when the layer is built, so
 * `otlp()` alone means "whatever the env says". `endpoint` and `endpoints` together is a type error (and, at run time,
 * that target is off with an error).
 *
 * @experimental
 *
 * @example
 * defineObservability({
 *   exporters: [
 *     otlp({ endpoint: "https://otel.example.com", protocol: "http/protobuf", headers: { "x-api-key": process.env.OTEL_KEY! } }),
 *     otlp({ endpoints: { traces: "https://traces.example.com/api/ingest/?tenant=acme" } }),
 *   ],
 * });
 */
export function otlp(target: OtlpTarget = {}): OtlpTarget {
  return { ...target, ...(target.headers && { headers: { ...target.headers } }) };
}
