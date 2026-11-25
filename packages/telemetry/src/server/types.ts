import type { ChatObservability } from "@webmcp-agents/chat/server";
import type { RedactOptions, Redactor } from "@webmcp-agents/core/redact";
import type { OtlpTarget, ReadableSpanLike, Sampling, SpanExporter, SpanProcessor, TracerProviderOption } from "../shared/types";

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
   * Resource attributes added on the server (a release, a region), never trusted from the browser. Through an app's
   * own provider, where the resource is the app's, they are set on each span instead.
   *
   * @example
   * attributes: () => ({ "service.version": process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" })
   */
  attributes?: (req: Request) => Record<string, string>;
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
}
