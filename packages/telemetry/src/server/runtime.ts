/**
 * The built layer (design §7.4): created on the first request, never at import. Loads the optional peers, picks where
 * spans go (§7.2), builds a private provider when that is the answer, and gives each request its AI SDK integrations
 * over a request-scoped tracer. It never registers anything globally and never shuts down a provider it did not build.
 */
import type * as Api from "@opentelemetry/api";
import type { ChatRequestContext } from "@webmcp-agents/chat/server";
import type { Redactor } from "@webmcp-agents/core/redact";
import {
  ATTR_CONVERSATION_ID,
  ATTR_PARENT_CALL_ID,
  ATTR_RUN_ID,
  ATTR_SESSION_ID,
  ATTR_STEP,
  ATTR_WEBMCP_AGENT_ID,
  SCOPE_NAME,
  SCOPE_NAME_LEGACY,
} from "../semconv";
import type { Attributes, OtlpTarget, ReadableSpanLike, Sampling, SamplingContext, SpanExporter, TracerProvider } from "../shared/types";
import { cleanAttributes, isSampled, parseTraceparent, registeredGlobalTrace, VERSION, withMappedKeys } from "../shared/util";
import { type Env, resolveMode, resolveOtlp, resourceAttributes, samplingFromEnv } from "./config";
import type { Log } from "./log";
import { httpJsonExporter } from "./otlp-json";
import { loadPeer, MissingPeerError } from "./peers";
import { Pipeline } from "./pipeline";
import { requestTracer } from "./tracer";
import type { ObservabilityConfig } from "./types";

/** A span the relay decoded: browser ids and times, attributes already redacted. */
export interface RelaySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  /** The API's `SpanKind` (OTLP's minus one). */
  kind: number;
  startTime: Api.HrTime;
  endTime: Api.HrTime;
  attributes: Attributes;
  events: { name: string; time: Api.HrTime; attributes?: Attributes }[];
  status: { code: number; message?: string };
}

/** What the observability layer uses once built. */
export interface Runtime {
  /** Whether this request's trace is exported. */
  sampled(ctx: ChatRequestContext, request?: Request): boolean;
  /** This request's AI SDK integrations, over a tracer scoped to it. */
  integrations(ctx: ChatRequestContext): unknown[];
  /** Run inside the request's trace context (only matters to an app that registered a context manager). */
  withParent<T>(traceparent: string | null, run: () => Promise<T>): Promise<T>;
  /** Send buffered spans (a private provider's, or the app provider's `forceFlush` when it has one). */
  flush(): Promise<void>;
  /** Shut down a private provider; an app's provider is only flushed. */
  shutdown(): Promise<void>;
  /** Re-emit spans the relay accepted, through the same pipeline as the server's. */
  relay(spans: readonly RelaySpan[], resource: Record<string, string>, request: Request): void;
  /** Map then redact attributes: what the relay applies to the browser's spans. */
  finalize(attributes: Readonly<Record<string, unknown>>): Attributes;
  /** The request store, when `AsyncLocalStorage` exists here (Node, Vercel, Workers with nodejs_compat). */
  requests?: { run<T>(request: Request, fn: () => T): T; getStore(): Request | undefined };
}

/** A minimal OpenTelemetry `Resource` (the SDK's interface), so `@opentelemetry/resources` need not be installed. */
function ownResource(attributes: Record<string, string>) {
  const raw = Object.entries(attributes);
  const resource = {
    attributes,
    schemaUrl: undefined,
    asyncAttributesPending: false,
    waitForAsyncAttributes: async () => {},
    getRawAttributes: () => raw,
    // `other` wins, as in the SDK
    merge: (other: { attributes?: Record<string, unknown> } | null): unknown =>
      other ? ownResource({ ...attributes, ...(cleanAttributes(other.attributes) as Record<string, string>) }) : resource,
  };
  return resource;
}

/** The provider to call `forceFlush` on: the delegate behind the API's proxy, when it is one. */
const flushable = (provider: unknown): { forceFlush?: () => Promise<void> } => {
  const p = provider as { getDelegate?: () => unknown };
  return (typeof p?.getDelegate === "function" ? p.getDelegate() : p) as { forceFlush?: () => Promise<void> };
};

/**
 * The app's registered global provider, or undefined. The API always hands out a proxy, registered or not: the
 * registry's `trace` entry exists only after `setGlobalTracerProvider`, and its delegate must not be the no-op provider
 * (compared by identity with this copy of the API's, and by name for another copy's) (open question 9).
 */
export function globalProvider(api: typeof Api | undefined): TracerProvider | undefined {
  const registered = registeredGlobalTrace();
  if (!registered) return undefined;
  const delegate = typeof registered.getDelegate === "function" ? registered.getDelegate() : registered;
  const noop = api ? new api.ProxyTracerProvider().getDelegate() : undefined;
  if (!delegate || delegate === noop || (delegate as { constructor?: { name?: string } }).constructor?.name === "NoopTracerProvider")
    return undefined;
  return registered as TracerProvider;
}

/** Build the layer, or null when it is off (each reason logged once). Never rejects for a configuration problem. */
export async function buildRuntime(
  config: ObservabilityConfig,
  env: Env,
  log: Log,
  redactor: () => Redactor | false,
): Promise<Runtime | null> {
  // ---------- 1. the API, then where spans go ----------
  let api: typeof Api;
  try {
    api = await loadPeer<typeof Api>("@opentelemetry/api");
  } catch (err) {
    return off(log, err);
  }
  const { mode, off: why } = resolveMode(config, env, !!globalProvider(api));
  if (mode === "off") {
    if (why === "no-global-provider")
      log.error(
        "no-global",
        'telemetry is off: tracerProvider: "global" was set, but no tracer provider is registered. Register one first (any OpenTelemetry SDK setup does), or remove the option. The chat is unaffected.',
      );
    else if (why === "nothing-configured" && env.NODE_ENV === "development")
      log.info("nothing", "telemetry is off: set OTEL_EXPORTER_OTLP_ENDPOINT, pass exporters, or register a tracer provider.");
    return null;
  }
  let otel: { OpenTelemetry: new (o: object) => unknown; LegacyOpenTelemetry: new (o: object) => unknown };
  try {
    otel = await loadPeer("@ai-sdk/otel");
  } catch (err) {
    return off(log, err);
  }

  // ---------- 2. the provider ----------
  const attributes = resourceAttributes(config, env, (entry) =>
    log.error("resource", `OTEL_RESOURCE_ATTRIBUTES has an entry without "=" ("${entry.slice(0, 40)}"): it was skipped`),
  );
  const finalize = (a: Readonly<Record<string, unknown>>): Attributes => {
    const out: Record<string, unknown> = { ...a };
    for (const [from, to] of Object.entries(config.metadataMapping ?? {})) if (out[from] !== undefined) out[to] = out[from];
    const r = redactor();
    return cleanAttributes(r ? withMappedKeys(r, config.metadataMapping ?? {})(out, { kind: "attribute" }) : out);
  };
  const text = (s: string): string => {
    const r = redactor();
    return r ? r.text(s) : s;
  };
  let provider: TracerProvider;
  let pipeline: Pipeline | undefined;
  if (mode === "provider") provider = config.tracerProvider as TracerProvider;
  else if (mode === "global") provider = globalProvider(api)!;
  else {
    let sdk: { TracerProvider: new (o: object) => TracerProvider; AlwaysOnSampler: new () => unknown };
    try {
      sdk = await loadPeer("@opentelemetry/sdk-trace");
    } catch (err) {
      return off(log, err);
    }
    const given = config.exporters?.length ? config.exporters : config.spanProcessors?.length ? [] : [{} as OtlpTarget];
    const exporters = (await Promise.all(given.map((x, i) => toExporter(x, i, env, log)))).filter((x): x is SpanExporter => !!x);
    if (!exporters.length && !config.spanProcessors?.length) {
      log.error("no-exporter", "telemetry is off: no exporter could be set up (see the errors above). The chat is unaffected.");
      return null;
    }
    pipeline = new Pipeline({
      exporters,
      redactor,
      mapping: config.metadataMapping ?? {},
      filter: config.spanFilter,
      batchSize: Math.max(1, config.batchSize ?? 512),
      delayMs: 5000,
      timeout: Math.max(...given.map((x) => ("export" in x ? 0 : timeoutOf(x as OtlpTarget, env))), 1000),
      debug: config.debug ?? env.WEB_AGENTS_OTEL_DEBUG?.trim().toLowerCase() === "true",
      log,
    });
    try {
      provider = new sdk.TracerProvider({
        resource: ownResource(attributes),
        sampler: new sdk.AlwaysOnSampler(),
        spanProcessors: [...(config.spanProcessors ?? []), pipeline],
      });
    } catch (err) {
      log.error("provider", "telemetry is off: the tracer provider could not be created", err);
      return null;
    }
  }

  // ---------- 3. per request: sampling, tracers, integrations ----------
  const style = config.conventions ?? "genai";
  const sampling: Sampling | undefined = config.sampling ?? samplingFromEnv(env, (message) => log.error("sampler", `${message}.`));
  const genai = style !== "legacy" ? (provider.getTracer(SCOPE_NAME, VERSION) as Api.Tracer) : undefined;
  const legacy = style !== "genai" ? (provider.getTracer(SCOPE_NAME_LEGACY, VERSION) as Api.Tracer) : undefined;
  const filter = config.spanFilter;
  const startFilter =
    mode !== "private" && filter
      ? (name: string, a: Attributes) =>
          filter({
            name,
            kind: 0,
            attributes: a,
            spanContext: () => api.INVALID_SPAN_CONTEXT,
            startTime: [0, 0],
            endTime: [0, 0],
            status: { code: 0 },
            events: [],
            instrumentationScope: { name: SCOPE_NAME, version: VERSION },
            resource: { attributes },
          })
      : undefined;
  let requests: Runtime["requests"];
  try {
    const hooks = await import("node:async_hooks");
    requests = new hooks.AsyncLocalStorage<Request>();
  } catch {
    // no AsyncLocalStorage here: a custom sampler gets no `request` for model steps (the relay still passes it)
  }
  const relayTracer = mode === "private" ? undefined : (provider.getTracer(SCOPE_NAME, VERSION) as Api.Tracer);
  const relayed = new Map<string, Api.SpanContext>();

  return {
    requests,
    finalize,
    sampled(ctx, request) {
      const sc: SamplingContext = { agent: ctx.agent?.id, conversation: ctx.trace?.conversation, request: request ?? requests?.getStore() };
      return isSampled(sampling, parseTraceparent(ctx.traceparent)?.[0], sc);
    },
    integrations(ctx) {
      const ids = parseTraceparent(ctx.traceparent);
      const scope = {
        ids: cleanAttributes({
          [ATTR_CONVERSATION_ID]: ctx.trace?.conversation,
          [ATTR_RUN_ID]: ctx.trace?.run,
          [ATTR_STEP]: ctx.trace?.step,
          [ATTR_PARENT_CALL_ID]: ctx.trace?.parent,
          [ATTR_WEBMCP_AGENT_ID]: ctx.agent?.id,
          [ATTR_SESSION_ID]: ctx.session,
        }),
        // the browser decided to send it: the server's own sampling already ran, so the flag is set
        remote: ids && { traceId: ids[0], spanId: ids[1], traceFlags: api.TraceFlags.SAMPLED, isRemote: true },
        finalize,
        text,
        filter: startFilter,
      };
      return [
        ...(genai ? [new otel.OpenTelemetry({ tracer: requestTracer(api, genai, scope), agentSpanName: "functionId" })] : []),
        ...(legacy ? [new otel.LegacyOpenTelemetry({ tracer: requestTracer(api, legacy, scope) })] : []),
      ];
    },
    async withParent(traceparent, run) {
      const ids = parseTraceparent(traceparent);
      if (!ids) return run();
      const remote = { traceId: ids[0], spanId: ids[1], traceFlags: api.TraceFlags.SAMPLED, isRemote: true };
      return api.context.with(api.trace.setSpanContext(api.context.active(), remote), run);
    },
    async flush() {
      if (pipeline) await (provider as unknown as { forceFlush(): Promise<void> }).forceFlush();
      else await flushable(provider).forceFlush?.();
    },
    async shutdown() {
      if (pipeline) await (provider as unknown as { shutdown(): Promise<void> }).shutdown();
      else await flushable(provider).forceFlush?.();
    },
    relay(spans, extra, request) {
      const kept = spans.filter((s) => isSampled(sampling, s.traceId, { request }));
      if (!kept.length) return;
      if (pipeline) {
        const resource = ownResource({ ...attributes, ...extra });
        for (const s of kept) {
          const span = asReadable(s, resource);
          for (const p of config.spanProcessors ?? []) {
            try {
              p.onEnd(span);
            } catch (err) {
              log.error("processor", "a span processor threw on a relayed span", err);
            }
          }
          pipeline.push(span);
        }
        return;
      }
      replay(api, relayTracer!, kept, extra, relayed);
    },
  };
}

/** Off because a package is missing or failed to load: one line naming it. */
function off(log: Log, err: unknown): null {
  if (err instanceof MissingPeerError) log.error(`peer:${err.peer}`, `telemetry is off: ${err.message} The chat is unaffected.`);
  else log.error("load", "telemetry is off: a telemetry package failed to load. The chat is unaffected", err);
  return null;
}

/** The export timeout of one target (for the pipeline's cap and `flush`). */
export function timeoutOf(target: OtlpTarget, env: Env): number {
  const r = resolveOtlp(target, env);
  return "error" in r ? 0 : r.timeout;
}

/** One `exporters` entry as a `SpanExporter`, or undefined (logged once) when it cannot be used. */
async function toExporter(entry: OtlpTarget | SpanExporter, index: number, env: Env, log: Log): Promise<SpanExporter | undefined> {
  if (typeof (entry as SpanExporter).export === "function") return entry as SpanExporter;
  const target = resolveOtlp(entry as OtlpTarget, env, (header) =>
    log.error(`header:${header}`, `OTEL_EXPORTER_OTLP_HEADERS has an entry that is not "key=value": it was skipped`),
  );
  if ("error" in target) {
    log.error(`target:${index}`, `${target.error}. That target is off; the others still export`);
    return undefined;
  }
  if (target.protocol === "http/json") return httpJsonExporter(target);
  const peer = target.protocol === "grpc" ? "@opentelemetry/exporter-trace-otlp-grpc" : "@opentelemetry/exporter-trace-otlp-proto";
  try {
    const m = await loadPeer<{ OTLPTraceExporter: new (o: object) => SpanExporter }>(peer);
    return new m.OTLPTraceExporter({ url: target.url, headers: target.headers, timeoutMillis: target.timeout });
  } catch (err) {
    if (err instanceof MissingPeerError)
      log.error(`peer:${peer}`, `the "${target.protocol}" target is off: ${err.message} Or use protocol "http/json", which needs nothing`);
    else log.error(`exporter:${index}`, `the "${target.protocol}" target is off: its exporter could not be created`, err);
    return undefined;
  }
}

/** A relayed span as a `ReadableSpan`, under the server's resource and this package's scope. */
function asReadable(s: RelaySpan, resource: ReturnType<typeof ownResource>): ReadableSpanLike {
  const ctx = { traceId: s.traceId, spanId: s.spanId, traceFlags: 1, isRemote: true };
  const duration: Api.HrTime = [s.endTime[0] - s.startTime[0], s.endTime[1] - s.startTime[1]];
  if (duration[1] < 0) {
    duration[0] -= 1;
    duration[1] += 1e9;
  }
  return {
    name: s.name,
    kind: s.kind,
    spanContext: () => ctx,
    ...(s.parentSpanId && { parentSpanContext: { traceId: s.traceId, spanId: s.parentSpanId, traceFlags: 1, isRemote: true } }),
    startTime: s.startTime,
    endTime: s.endTime,
    status: s.status,
    attributes: s.attributes,
    events: s.events,
    instrumentationScope: { name: SCOPE_NAME, version: VERSION },
    resource,
    ...({ links: [], duration, ended: true, droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0 } as object),
  };
}

/**
 * Relayed spans through a provider this package does not own: it makes its own span ids, so parents are created
 * first and children placed under the new ids (remembered across batches, up to 2000). A span whose parent is not
 * known keeps its trace, under the browser's parent id: the run span (and the server's step spans) share it.
 */
function replay(
  api: typeof Api,
  tracer: Api.Tracer,
  spans: readonly RelaySpan[],
  extra: Record<string, string>,
  seen: Map<string, Api.SpanContext>,
): void {
  const pending = new Map(spans.map((s) => [s.spanId, s]));
  const place = (s: RelaySpan): void => {
    if (!pending.delete(s.spanId)) return;
    const parentInBatch = s.parentSpanId ? pending.get(s.parentSpanId) : undefined;
    if (parentInBatch) place(parentInBatch);
    const parent =
      (s.parentSpanId && seen.get(s.parentSpanId)) ||
      ({ traceId: s.traceId, spanId: s.parentSpanId ?? s.spanId, traceFlags: api.TraceFlags.SAMPLED, isRemote: true } as Api.SpanContext);
    const span = tracer.startSpan(
      s.name,
      { kind: s.kind, startTime: s.startTime, attributes: { ...s.attributes, ...extra } },
      api.trace.setSpanContext(api.ROOT_CONTEXT, parent),
    );
    for (const e of s.events) span.addEvent(e.name, e.attributes, e.time);
    if (s.status.code) span.setStatus({ code: s.status.code, message: s.status.message });
    seen.set(s.spanId, span.spanContext());
    if (seen.size > 2000) seen.delete(seen.keys().next().value!);
    span.end(s.endTime);
  };
  for (const s of spans) {
    try {
      place(s);
    } catch {
      // the app's provider threw on one span: the others still go
    }
  }
}
