import type { ChatObservability } from "@webmcp-agents/chat/server";
import type { RedactOptions, Redactor } from "@webmcp-agents/core/redact";
import type {
  CustomAttributes,
  OtlpTarget,
  ReadableSpanLike,
  Sampling,
  SpanExporter,
  SpanProcessor,
  TracerProviderOption,
} from "../shared/types";

/**
 * Options for `defineObservability()`. Every field is optional: with none, the standard `OTEL_*` variables (or a
 * tracer provider the app registered) decide.
 *
 * @experimental
 */
export interface ObservabilityConfig {
  /** `service.name` of every span. Default `OTEL_SERVICE_NAME`, else `"web-agents"`. */
  serviceName?: string;
  /** Resource attributes (release, region), merged over `OTEL_RESOURCE_ATTRIBUTES`; an option wins over the env. */
  resourceAttributes?: Record<string, string>;
  /**
   * Where spans go: OTLP targets (`otlp()`) and/or any OpenTelemetry `SpanExporter` instance, as is. Default: the
   * app's registered tracer provider, else one OTLP target from `OTEL_EXPORTER_OTLP_*`, else off.
   *
   * @example
   * exporters: [otlp({ endpoint: "https://otel.example.com", headers: { "x-api-key": process.env.OTEL_KEY! } })]
   */
  exporters?: readonly (OtlpTarget | SpanExporter)[];
  /**
   * Any OpenTelemetry `SpanProcessor` (a vendor's own, or yours), as is. They run first, before `metadataMapping`,
   * redaction and `spanFilter`. A processor that exports by itself sends what the AI SDK set, which this package
   * redacted when the span was created; what the processor adds is its own to handle.
   */
  spanProcessors?: readonly SpanProcessor[];
  /**
   * A provider to use as is (its pipeline is the app's), `"global"` to require the app's registered one (off, with one
   * error, when there is none), or `"own"` never to use it. Default: the registered one when there is one.
   */
  tracerProvider?: TracerProviderOption;
  /**
   * Where the relay sends the browser's spans when the server's go through an app's provider (a `tracerProvider`, or
   * the registered one). `"exporter"`: straight to the OTLP target (`exporters`, else `OTEL_EXPORTER_OTLP_*`) with
   * the browser's own span ids, so a run and its tool calls need no reordering on the server and line up with the
   * server's step spans. `"provider"`: re-created through the app's provider (new span ids, a child that comes a batch
   * before its parent waits for it up to 30 s), for an app whose provider must see every span. With no OTLP target to
   * send to, it is `"provider"`. With a provider this package builds, spans always go through it. Default `"exporter"`.
   */
  relayThrough?: "exporter" | "provider";
  /**
   * What to do with the app's own `@ai-sdk/otel` integrations (`registerTelemetry(new OpenTelemetry())`) on a sampled
   * request whose spans go to the same provider as the app's (the registered one): `"dedupe"` leaves them out of that
   * call, logged once, so each model step is one `chat` span, not two; `"keep"` passes them along (both record). Other
   * integrations, and every one when the request is not sampled or the layer builds its own provider, are always
   * kept, never recording content. An `@ai-sdk/otel` integration the app gave a tracer of another provider is left out
   * as well: pass `"keep"` then. Default `"dedupe"`.
   */
  appIntegrations?: "dedupe" | "keep";
  /** Which requests are exported. Default `OTEL_TRACES_SAMPLER` (+ `_ARG`), else `{ type: "always" }`. */
  sampling?: Sampling;
  /**
   * Attribute style of the model spans: `"genai"` (`gen_ai.*`, default), `"legacy"` (`ai.*`, what LangWatch, PostHog
   * and Braintrust read), or `"both"`, each from its own tracer.
   */
  conventions?: "genai" | "legacy" | "both";
  /** Record prompts and tool definitions on model spans, redacted. The handler's own `telemetry.recordInputs` wins. Default false. */
  recordInputs?: boolean;
  /** Record the model's output on model spans, redacted. The handler's own `telemetry.recordOutputs` wins. Default false. */
  recordOutputs?: boolean;
  /**
   * Redaction of everything exported (server spans and relayed browser spans). Default: the process's redactor
   * (`configureRedaction`, `createChatHandler({ redact })`), read at each use. `false` only for local debugging.
   */
  redact?: false | RedactOptions | Redactor;
  /**
   * Copy one of the span's attributes to the name a backend groups by. Runs before redaction.
   *
   * @example
   * metadataMapping: { "webmcp.conversation.id": "session.id", "user.id": "enduser.id" }
   */
  metadataMapping?: Record<string, string>;
  /**
   * Keep (true) or drop (false) a span; a throw drops it. With a provider this package builds it runs last, on the
   * redacted span; through an app's provider it runs when the span starts (name and attributes only).
   */
  spanFilter?: (span: ReadableSpanLike) => boolean;
  /** Spans per export batch. Default 512. */
  batchSize?: number;
  /** Also print each exported span to the console, redacted. Default `WEB_AGENTS_OTEL_DEBUG === "true"`. */
  debug?: boolean;
  /** Where the `OTEL_*` variables are read. Default `process.env`. */
  env?: Record<string, string | undefined>;
}

/**
 * Options for `observability.relay()`, the endpoint that accepts the browser's spans.
 *
 * @experimental
 */
export interface TelemetryRelayOptions {
  /**
   * Runs first (after the cross-site check): return a `Response` to refuse the request (a rate limit, a session check),
   * or nothing to let it through. A throw refuses with 500 and is logged once.
   */
  guard?: (req: Request) => Promise<Response | undefined> | Response | undefined;
  /** The largest body accepted, in bytes; larger is refused with 413. Default 262144 (256 KB). */
  maxBytes?: number;
  /**
   * Accept a `POST` with no `Origin` header. Default `false`: a browser always sends one (`fetch`, `keepalive`,
   * `sendBeacon`), so a request without it is a script (`curl`, a bot) and is refused with 403. Set it only behind a
   * proxy that strips `Origin`, and give the relay a `guard` then: anything that reaches it is forwarded to the backend.
   */
  allowMissingOrigin?: boolean;
  /**
   * Resource attributes added on the server (a release, a region), never trusted from the browser. Through an app's
   * own provider, where the resource is the app's, they are set on each span instead.
   *
   * @example
   * attributes: () => ({ "service.version": process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" })
   */
  attributes?: (req: Request) => Record<string, string>;
}

/**
 * Options for `observability.event()` / `observability.span()`.
 *
 * @experimental
 */
export interface CustomSpanOptions {
  /**
   * The chat request this belongs to, for code that runs before the handler enters it: a `guard` or `beforeModel`
   * (both get the request). Code inside the request (a server-side tool, `prepareAgent`, `telemetry.metadata`, the
   * app's own code awaited there) needs nothing: the request is found by `AsyncLocalStorage`. On the very first
   * request the layer is not built yet when its `guard` runs: that one span is not recorded.
   */
  request?: Request;
}

/**
 * What `defineObservability()` returns: the chat handler's `observability` layer, plus the relay and shutdown.
 * Nothing loads until the first request.
 *
 * @experimental
 */
export interface Observability extends ChatObservability {
  /** Whether spans will be exported: false when the configuration resolves to off, or once building it failed. */
  readonly enabled: boolean;
  /**
   * A `POST` handler that accepts the browser's spans and forwards them through this layer (mount it at
   * `/api/telemetry`). Arguments after the request are the host's (a Worker's `ctx`): one with `waitUntil` keeps the
   * function alive until the batch is sent, as Vercel's request context does.
   */
  relay(options?: TelemetryRelayOptions): (req: Request, ...host: unknown[]) => Promise<Response>;
  /** Send what is buffered and shut a provider this package built down. An app's own provider is only flushed. Never rejects. */
  shutdown(): Promise<void>;
  /**
   * Record that something happened during the current chat request: a zero-length span named `name` with
   * `attributes` and `webmcp.custom: true`, in the request's trace (see {@link Observability.span} for the parent,
   * the pipeline and the naming rule). A span, not a span event: the run span the request belongs to is the browser's,
   * and a span event can only go on a span still open in this process. A no-op outside a chat request and when the
   * request is not sampled.
   *
   * @experimental
   *
   * @example
   * observability.event("inventory.checked", { "inventory.sku": sku, "inventory.left": left });
   */
  event(name: string, attributes?: CustomAttributes, options?: CustomSpanOptions): void;
  /**
   * Run `fn` inside a span of the current chat request's trace, timed around it (sync, or until its promise settles).
   * A throw or rejection sets the span's status to error (`error.type`: the error's name) and is passed on unchanged;
   * returns what `fn` returns. Works in any code running during a chat request (a server-side tool, `prepareAgent`,
   * `telemetry.metadata`, the app's own code awaited inside the handler; a `guard` / `beforeModel` with
   * `{ request }`). Its parent, first match: the custom span it runs in; the app's active span (with a context manager
   * registered); the browser's run span when the page records it (the `traceparent`'s sampled flag); the request's
   * first model span. Before a request's first model step on a page that does not record its run, it starts a trace
   * of its own.
   *
   * It is sampled with the request, created by this layer's tracer (a provider it builds, or the app's), and goes
   * through the same pipeline as the model spans: `metadataMapping`, redaction, `spanFilter`. The name is the app's,
   * as given (redacted like any name); attribute keys are free except `webmcp.*` (dropped: reserved for this library,
   * which sets the request's ids and `webmcp.custom: true` itself). A no-op outside a chat request (no agent run to
   * join, no sampling decision to follow) and when the request is not sampled: `fn` just runs. Telemetry never breaks
   * `fn`: a failure in it is logged once.
   *
   * An app that already runs OpenTelemetry can also use `@opentelemetry/api` directly inside the request: with a
   * global provider and context manager registered, its spans join the same trace (and nest under this span).
   *
   * @experimental
   *
   * @example
   * const price = await observability.span("pricing.quote", () => quote(cart), { "cart.items": cart.length });
   */
  span<T>(name: string, fn: () => T, attributes?: CustomAttributes, options?: CustomSpanOptions): T;
}
