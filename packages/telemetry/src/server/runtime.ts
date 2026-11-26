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
  ATTR_CUSTOM,
  ATTR_ERROR_TYPE,
  ATTR_PARENT_CALL_ID,
  ATTR_RUN_ID,
  ATTR_SESSION_ID,
  ATTR_STEP,
  ATTR_WEBMCP_AGENT_ID,
  SCOPE_NAME,
  SCOPE_NAME_LEGACY,
} from "../semconv";
import type {
  Attributes,
  CustomAttributes,
  OtlpTarget,
  ReadableSpanLike,
  Sampling,
  SamplingContext,
  SpanExporter,
  TracerProvider,
} from "../shared/types";
import {
  appAttributes,
  cleanAttributes,
  failure,
  isSampled,
  parseTraceparent,
  registeredGlobalTrace,
  traceparentSampled,
  VERSION,
  withMappedKeys,
} from "../shared/util";
import { type Env, resolveMode, resolveOtlp, resourceAttributes, samplingFromEnv } from "./config";
import type { Log } from "./log";
import { httpJsonExporter } from "./otlp-json";
import { loadPeer, MissingPeerError } from "./peers";
import { Pipeline } from "./pipeline";
import { type RequestScope, requestTracer } from "./tracer";
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

/** One chat request's state, shared by everything that runs inside it (the request store). */
export interface RequestState {
  request: Request;
  /**
   * The request's sampling decision: `telemetry(ctx)`'s (it knows the agent), or the first custom span's when one comes
   * before it (by the `traceparent`'s trace id and the request only).
   */
  sampled?: boolean;
  /** The request's `webmcp.*` ids, once `telemetry(ctx)` knew them (set on custom spans too). */
  ids?: Attributes;
  /** The first span this request's tracer recorded without a parent: a custom span with no other parent goes under it. */
  root?: Api.SpanContext;
}

/** What the request store holds: the request's state, and the custom span the code is running in (for nesting). */
export interface RequestFrame {
  state: RequestState;
  parent?: Api.SpanContext;
}

/** The app's own span, started (`observability.span` / `.event`). */
export interface CustomSpan {
  /** End it; `error`: what it failed with (its status is then error); `instant`: at its start (an event). */
  end(error?: unknown, instant?: boolean): void;
  /** Run `fn` with this span as the parent of what starts inside it (custom spans, and the app's own through the API). */
  run<T>(fn: () => T): T;
}

/** What the observability layer uses once built. */
export interface Runtime {
  /** Whether this request's trace is exported. */
  sampled(ctx: ChatRequestContext, request?: Request): boolean;
  /** This request's AI SDK integrations, over a tracer scoped to it. */
  integrations(ctx: ChatRequestContext): unknown[];
  /**
   * True when `integration` is an app's own `@ai-sdk/otel` integration that would record the same model steps into
   * the same provider as this layer (the app's global one): the layer's spans would then be doubled.
   */
  duplicates(integration: unknown): boolean;
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
  requests?: { run<T>(frame: RequestFrame, fn: () => T): T; getStore(): RequestFrame | undefined };
  /**
   * Start the app's own span in the current request's trace (`request`: the one to use when the code runs outside the
   * request store, a `guard`), or undefined when it is not recorded: outside any request, or the request not sampled.
   */
  startCustom(name: string, attributes: CustomAttributes | undefined, request?: Request): CustomSpan | undefined;
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
  const newPipeline = (exporters: SpanExporter[], given: readonly (OtlpTarget | SpanExporter)[]): Pipeline =>
    new Pipeline({
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
    pipeline = newPipeline(exporters, given);
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

  // ---------- 2b. global / provider mode: the relay's own exporters ----------
  // The app's provider makes its own span ids, so relayed spans through it must be re-created (and a child that comes
  // a batch before its parent held). Sent straight to the OTLP target instead, they keep the browser's ids, and the
  // server's step spans (made under the run span's id) line up with them in one trace.
  let relayPipeline: Pipeline | undefined;
  if (mode !== "private" && config.relayThrough !== "provider") {
    const given = config.exporters?.length ? config.exporters : "error" in resolveOtlp({}, env) ? [] : [{} as OtlpTarget];
    const exporters = (await Promise.all(given.map((x, i) => toExporter(x, i, env, log)))).filter((x): x is SpanExporter => !!x);
    if (exporters.length) relayPipeline = newPipeline(exporters, given);
    else if (given.length)
      log.info("relay-provider", "relayed browser spans go through the app's tracer provider: no OTLP exporter could be set up for them");
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
    requests = new hooks.AsyncLocalStorage<RequestFrame>();
  } catch {
    // no AsyncLocalStorage here: a custom sampler gets no `request` for model steps (the relay still passes it)
  }
  const replayer =
    mode === "private" || relayPipeline
      ? undefined
      : createReplayer(api, provider.getTracer(SCOPE_NAME, VERSION) as Api.Tracer, attributes, filter, log);
  // an app's @ai-sdk/otel integration with no tracer of its own (the usual `new OpenTelemetry()`) records through the
  // global provider: the same one as this layer's in global mode, or when the provider passed in is that one
  const registered = globalProvider(api) as { getDelegate?: () => unknown } | undefined;
  const sameAsGlobal =
    mode === "global" || (mode === "provider" && !!registered && (provider === registered || provider === registered.getDelegate?.()));
  const otelClasses = [otel.OpenTelemetry, otel.LegacyOpenTelemetry];
  /** The page's run span as the parent, only when its `traceparent` says the page records it (the sampled flag). */
  const remoteOf = (traceparent: string | null | undefined): Api.SpanContext | undefined => {
    const ids = parseTraceparent(traceparent);
    return ids && traceparentSampled(traceparent)
      ? { traceId: ids[0], spanId: ids[1], traceFlags: api.TraceFlags.SAMPLED, isRemote: true }
      : undefined;
  };
  /** The tracer of the app's own spans: this package's scope (the relay accepts it), through the request's redaction. */
  const customTracer = provider.getTracer(SCOPE_NAME, VERSION) as Api.Tracer;

  return {
    requests,
    finalize,
    startCustom(name, attributes, explicit) {
      const frame = requests?.getStore();
      // a request named explicitly that is not the store's (a guard runs before the request store is entered)
      const state: RequestState | undefined =
        explicit && frame?.state.request !== explicit ? { request: explicit } : (frame?.state ?? (explicit && { request: explicit }));
      // outside a request: no agent run to join, no sampling decision to follow
      if (!state) return undefined;
      const traceparent = state.request.headers.get("traceparent");
      state.sampled ??= isSampled(sampling, parseTraceparent(traceparent)?.[0], { request: state.request });
      if (!state.sampled) return undefined;
      // ---------- the parent: the custom span this runs in › the app's active span › the page's run › the request's root ----------
      const active = api.trace.getSpanContext(api.context.active());
      const parent =
        (frame?.state === state && frame.parent) ||
        (active && api.trace.isSpanContextValid(active) ? active : undefined) ||
        remoteOf(traceparent) ||
        state.root;
      const ctx = parent ? api.trace.setSpanContext(api.context.active(), parent) : api.ROOT_CONTEXT;
      const tracer = requestTracer(api, customTracer, { ids: state.ids ?? {}, finalize, text, filter: startFilter });
      const startTime = performance.timeOrigin + performance.now();
      const span = tracer.startSpan(
        name,
        { kind: api.SpanKind.INTERNAL, startTime, attributes: cleanAttributes({ ...appAttributes(attributes), [ATTR_CUSTOM]: true }) },
        ctx,
      );
      return {
        end(error, instant) {
          if (error !== undefined) {
            const { type, message } = failure(error);
            span.setAttribute(ATTR_ERROR_TYPE, type);
            span.setStatus({ code: api.SpanStatusCode.ERROR, message });
          }
          span.end(instant ? startTime : undefined);
        },
        run(fn) {
          const inner = () => api.context.with(api.trace.setSpan(api.context.active(), span), fn);
          return requests ? requests.run({ state, parent: span.spanContext() }, inner) : inner();
        },
      };
    },
    sampled(ctx, request) {
      const sc: SamplingContext = {
        agent: ctx.agent?.id,
        conversation: ctx.trace?.conversation,
        request: request ?? requests?.getStore()?.state.request,
      };
      return isSampled(sampling, parseTraceparent(ctx.traceparent)?.[0], sc);
    },
    integrations(ctx) {
      const state = requests?.getStore()?.state;
      const scope: RequestScope = {
        ids: cleanAttributes({
          [ATTR_CONVERSATION_ID]: ctx.trace?.conversation,
          [ATTR_RUN_ID]: ctx.trace?.run,
          [ATTR_STEP]: ctx.trace?.step,
          [ATTR_PARENT_CALL_ID]: ctx.trace?.parent,
          [ATTR_WEBMCP_AGENT_ID]: ctx.agent?.id,
          [ATTR_SESSION_ID]: ctx.session,
        }),
        // a page that does not record its run span (no observeAgents, no consent, its sampling said no) sends the flag
        // unset: its span would never arrive, so the server's spans make their own trace, AI SDK wrappers included
        remote: remoteOf(ctx.traceparent),
        finalize,
        text,
        filter: startFilter,
        root: (sc) => {
          if (state && !state.root) state.root = sc;
        },
      };
      if (state) state.ids = scope.ids;
      return [
        ...(genai ? [new otel.OpenTelemetry({ tracer: requestTracer(api, genai, scope), agentSpanName: "functionId" })] : []),
        ...(legacy ? [new otel.LegacyOpenTelemetry({ tracer: requestTracer(api, legacy, scope) })] : []),
      ];
    },
    duplicates(integration) {
      if (!sameAsGlobal || typeof integration !== "object" || integration === null) return false;
      if (otelClasses.some((c) => integration instanceof c)) return true;
      // a second copy of @ai-sdk/otel (another version in the app's tree) fails instanceof: its class names still match
      const name = (integration as { constructor?: { name?: unknown } }).constructor?.name;
      return name === "OpenTelemetry" || name === "LegacyOpenTelemetry";
    },
    async withParent(traceparent, run) {
      const remote = remoteOf(traceparent);
      if (!remote) return run();
      return api.context.with(api.trace.setSpanContext(api.context.active(), remote), run);
    },
    async flush() {
      if (pipeline) await (provider as unknown as { forceFlush(): Promise<void> }).forceFlush();
      else await Promise.all([relayPipeline?.forceFlush(), flushable(provider).forceFlush?.()]);
    },
    async shutdown() {
      if (pipeline) await (provider as unknown as { shutdown(): Promise<void> }).shutdown();
      else {
        // children still waiting for a parent go now, under the page's ids, rather than be lost
        replayer?.releaseAll();
        // the relay's exporters are this layer's own; the app's provider is only flushed
        await Promise.all([relayPipeline?.shutdown(), flushable(provider).forceFlush?.()]);
      }
    },
    relay(spans, extra, request) {
      // one decision per trace in a request: a custom sampler must not keep a child and drop its parent
      const decided = new Map<string, boolean>();
      const kept = spans.filter((s) => {
        let keep = decided.get(s.traceId);
        if (keep === undefined) {
          keep = isSampled(sampling, s.traceId, { request });
          decided.set(s.traceId, keep);
        }
        return keep;
      });
      if (!kept.length) return;
      const out = pipeline ?? relayPipeline;
      if (out) {
        const resource = ownResource({ ...attributes, ...extra });
        for (const s of kept) {
          const span = asReadable(s, resource);
          // `spanProcessors` belong to a provider this package builds (private mode) only
          for (const p of pipeline ? (config.spanProcessors ?? []) : []) {
            try {
              p.onEnd(span);
            } catch (err) {
              log.error("processor", "a span processor threw on a relayed span", err);
            }
          }
          out.push(span);
        }
        return;
      }
      replayer!.relay(kept, extra);
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

/** Browser span ids remembered, and children held, at most (each). */
const MAX_KNOWN = 2000;
/** How long a child waits for its parent's batch before it goes under the page's ids. */
const HOLD_MS = 30_000;

/** A relayed span waiting for its parent, with its request's server-side attributes. */
interface Held {
  span: RelaySpan;
  extra: Record<string, string>;
  at: number;
}

/**
 * Relayed spans through a provider this package does not own (design §7.6): the fallback when no OTLP target resolves
 * for the relay in global / provider mode, or `relayThrough: "provider"`. The provider makes its own span ids, so a
 * span can be created only once its parent's new id is known: parents first within a batch, and across batches a
 * child whose parent has not arrived (the page sends a run's spans together, but flushes early on its caps, on
 * `pagehide`, and an older page sends every 2 s) is held until it does. A child held longer than {@link HOLD_MS}, or pushed out by {@link MAX_KNOWN} newer ones, goes under
 * the browser's parent id in the same trace. `spanFilter` runs on each span here (the private pipeline runs it on
 * its own); a skipped span hands its parent on to its children.
 */
function createReplayer(
  api: typeof Api,
  tracer: Api.Tracer,
  resource: Record<string, string>,
  filter: ObservabilityConfig["spanFilter"],
  log: Log,
) {
  /** Browser span id → the context its children go under (the new span's, or a skipped span's parent). */
  const seen = new Map<string, Api.SpanContext>();
  /** Held children by span id, oldest first. */
  const held = new Map<string, Held>();
  /** Parent's browser span id → the ids of the children held for it. */
  const waiting = new Map<string, Set<string>>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fallback = (s: RelaySpan): Api.SpanContext => ({
    traceId: s.traceId,
    spanId: s.parentSpanId ?? s.spanId,
    traceFlags: api.TraceFlags.SAMPLED,
    isRemote: true,
  });
  const keep = (s: RelaySpan, extra: Record<string, string>): boolean => {
    if (!filter) return true;
    try {
      return filter(asReadable(s, ownResource({ ...resource, ...extra }))) !== false;
    } catch (err) {
      log.error("filter", "spanFilter threw: the span was dropped", err);
      return false;
    }
  };
  const place = (s: RelaySpan, extra: Record<string, string>, parent: Api.SpanContext): void => {
    let ctx = parent;
    if (keep(s, extra)) {
      try {
        const span = tracer.startSpan(
          s.name,
          { kind: s.kind, startTime: s.startTime, attributes: { ...s.attributes, ...extra } },
          api.trace.setSpanContext(api.ROOT_CONTEXT, parent),
        );
        for (const e of s.events) span.addEvent(e.name, e.attributes, e.time);
        if (s.status.code) span.setStatus({ code: s.status.code, message: s.status.message });
        ctx = span.spanContext();
        span.end(s.endTime);
      } catch {
        // the app's provider threw on one span: its children still go, under its parent
      }
    }
    seen.set(s.spanId, ctx);
    if (seen.size > MAX_KNOWN) seen.delete(seen.keys().next().value!);
    const kids = waiting.get(s.spanId);
    waiting.delete(s.spanId);
    for (const id of kids ?? []) {
      const h = held.get(id);
      if (!h) continue;
      held.delete(id);
      place(h.span, h.extra, ctx);
    }
  };
  /** Stop waiting for `h`'s parent: it goes under the browser's parent id. */
  const release = (h: Held): void => {
    if (!held.delete(h.span.spanId)) return;
    const siblings = waiting.get(h.span.parentSpanId!);
    siblings?.delete(h.span.spanId);
    if (siblings && !siblings.size) waiting.delete(h.span.parentSpanId!);
    place(h.span, h.extra, fallback(h.span));
  };
  const expire = (): void => {
    const now = Date.now();
    for (const h of held.values()) {
      if (now - h.at < HOLD_MS) break;
      release(h);
    }
    clearTimeout(timer);
    timer = undefined;
    const oldest = held.values().next().value;
    if (!oldest) return;
    timer = setTimeout(expire, Math.max(0, oldest.at + HOLD_MS - now));
    (timer as { unref?: () => void }).unref?.();
  };

  return {
    relay(spans: readonly RelaySpan[], extra: Record<string, string>): void {
      const batch = new Map(spans.map((s) => [s.spanId, s]));
      const visit = (s: RelaySpan): void => {
        if (!batch.delete(s.spanId)) return;
        const p = s.parentSpanId;
        const parentInBatch = p ? batch.get(p) : undefined;
        if (parentInBatch) visit(parentInBatch);
        const known = p ? seen.get(p) : fallback(s);
        if (known) {
          place(s, extra, known);
          return;
        }
        held.set(s.spanId, { span: s, extra, at: Date.now() });
        let kids = waiting.get(p!);
        if (!kids) {
          kids = new Set();
          waiting.set(p!, kids);
        }
        kids.add(s.spanId);
        if (held.size > MAX_KNOWN) release(held.values().next().value!);
      };
      for (const s of spans) visit(s);
      expire();
    },
    /** Everything still held goes now (shutdown). */
    releaseAll(): void {
      for (const h of held.values()) release(h);
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
