/**
 * `defineObservability()` and `otlp()`: the chat handler's observability layer (design §7.3, §7.4). Lazy: nothing is
 * loaded and nothing is sent until the first request, and every fault (a missing package, bad env, a failing
 * exporter) is logged once and turns only the affected part off. A chat request's outcome and timing never depend on it.
 */
import { type ChatRequestContext, validTraceparent } from "@webmcp-agents/chat/server";
import { createRedactor, getRedactor, type Redactor } from "@webmcp-agents/core/redact";
import type { CustomAttributes, OtlpTarget, SpanExporter } from "../shared/types";
import { around } from "../shared/util";
import { killSwitch, resolveMode } from "./config";
import { createLog } from "./log";
import { createRelay } from "./relay";
import { buildRuntime, type CustomSpan, globalProvider, type Runtime, timeoutOf } from "./runtime";
import type { CustomSpanOptions, Observability, ObservabilityConfig } from "./types";

/** The chat's `ChatObservability.exportTimeoutMs` default (how long the handler waits for a flush). */
const DEFAULT_FLUSH_CAP = 5000;

/** The globally registered AI SDK integrations (`registerTelemetry`): read, never written (decision 4). */
const appIntegrations = (): unknown[] => {
  const list = (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown }).AI_SDK_TELEMETRY_INTEGRATIONS;
  return Array.isArray(list) ? list : [];
};

const quiet = new WeakMap<object, unknown>();
/**
 * An app's integration that never records content: every event it hears says `recordInputs` / `recordOutputs`
 * false. A call's flags reach every integration of the call; this layer's redact what they record, an app's would
 * export raw prompts (R-EXP-5). Its spans and timings are unchanged.
 */
function withoutContent(integration: unknown): unknown {
  if (typeof integration !== "object" || integration === null) return integration;
  let out = quiet.get(integration);
  if (!out) {
    const strip = (arg: unknown): unknown =>
      typeof arg === "object" && arg !== null && ("recordInputs" in arg || "recordOutputs" in arg)
        ? { ...arg, recordInputs: false, recordOutputs: false }
        : arg;
    out = new Proxy(integration, {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver);
        return typeof value === "function" ? (...args: unknown[]) => value.apply(target, args.map(strip)) : value;
      },
    });
    quiet.set(integration, out);
  }
  return out;
}

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

  /** The app's own span, or undefined (not recorded, or the layer is not built: it builds on the first chat request). */
  const custom = (name: string, attributes?: CustomAttributes, options?: CustomSpanOptions): CustomSpan | undefined => {
    if (typeof name !== "string" || !name) return undefined;
    try {
      // a guard on the first request runs before the layer is built: start building it, this span is not recorded
      if (built === undefined && options?.request) void runtime();
      return built?.startCustom(name, attributes, options?.request);
    } catch (err) {
      log.error("custom", "a custom span or event was skipped (the app is unaffected)", err);
      return undefined;
    }
  };

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
      // the app's own spans in this request follow the same decision (one made before by a custom span is replaced)
      const frame = rt.requests?.getStore();
      if (frame) frame.state.sampled = sampled;
      let app = appIntegrations();
      // the app's own @ai-sdk/otel integration recording into the same provider as ours: every step twice
      if (sampled && config.appIntegrations !== "keep") {
        const all = app.length;
        app = app.filter((x) => !rt.duplicates(x));
        if (app.length < all)
          log.info(
            "dedupe",
            "the app's own @ai-sdk/otel integration was left out of the chat's model calls: this layer records the same steps into the same tracer provider (pass appIntegrations: \"keep\" to keep both)",
          );
      }
      return {
        // per-call integrations replace the registered ones for that call (ai@7): pass the app's along with ours, the
        // app's without content (ours redact what they record, an app's would not; the handler's flags may turn it on)
        integrations: [...app.map(withoutContent), ...(sampled ? rt.integrations(ctx) : [])] as never,
        recordInputs: config.recordInputs ?? false,
        recordOutputs: config.recordOutputs ?? false,
      };
    },
    async withContext(req, run) {
      const rt = await runtime();
      if (!rt) return run();
      const go = () => rt.withParent(validTraceparent(req.headers.get("traceparent")) ?? null, run);
      return rt.requests ? rt.requests.run({ state: { request: req } }, go) : go();
    },
    flush: () => settle((rt) => rt.flush()),
    shutdown: () => settle((rt) => rt.shutdown()),
    relay: (options) => createRelay({ runtime, text, flush: () => settle((rt) => rt.flush()), log }, options),
    event(name, attributes, options) {
      try {
        custom(name, attributes, options)?.end(undefined, true);
      } catch (err) {
        log.error("custom", "a custom event was skipped (the app is unaffected)", err);
      }
    },
    span(name, fn, attributes, options) {
      const s = custom(name, attributes, options);
      if (!s) return fn();
      let called = false;
      const end = (error?: unknown): void => {
        try {
          s.end(error);
        } catch (err) {
          log.error("custom", "a custom span could not be ended; it may be lost (the app is unaffected)", err);
        }
      };
      return around(() => {
        try {
          return s.run(() => {
            called = true;
            return fn();
          });
        } catch (err) {
          // telemetry failed before fn ran: run it bare
          if (called) throw err;
          log.error("custom", "a custom span could not be entered; its code ran without it (the app is unaffected)", err);
          return fn();
        }
      }, end);
    },
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
