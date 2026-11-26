/**
 * Types both entries share. The OpenTelemetry shapes here are structural on purpose: any `SpanExporter`,
 * `SpanProcessor` or `TracerProvider` from the OpenTelemetry SDK (or a vendor package built on it) fits them, and this
 * package's public types never import `@opentelemetry/*`, which stays an optional install.
 */

/** A span attribute value, as OpenTelemetry allows it. */
export type AttributeValue = string | number | boolean | readonly string[] | readonly number[] | readonly boolean[];

/** Span attributes. */
export type Attributes = Record<string, AttributeValue>;

/**
 * Attributes of the app's own event or span (`recordAgentEvent`, `withAgentSpan`, `observability.event` / `.span`).
 * Keys are free, except that `webmcp.*` is this library's: such keys are dropped (a custom span carries the run's
 * real ids, and app code must not be able to forge them). Values that are not attribute values (objects, `null`,
 * `undefined`) are left out. Every value is redacted like the package's own.
 *
 * @experimental
 */
export type CustomAttributes = Readonly<Record<string, AttributeValue | null | undefined>>;

/** The fields every OTLP target has, whichever way its URL is given. */
interface OtlpTargetFields {
  /**
   * The wire format. `"http/json"` (default) needs no dependency and runs on the edge and in the browser;
   * `"http/protobuf"` loads `@opentelemetry/exporter-trace-otlp-proto` and `"grpc"` loads
   * `@opentelemetry/exporter-trace-otlp-grpc` (optional installs, server only). Default: `OTEL_EXPORTER_OTLP_PROTOCOL`,
   * else `"http/json"`.
   */
  protocol?: "http/json" | "http/protobuf" | "grpc";
  /**
   * Headers sent with every export (an API key, a project). Merged over `OTEL_EXPORTER_OTLP_HEADERS` only when the URL
   * also comes from the env (no `endpoint` / `endpoints`): a target with its own URL gets only these, so the env's key
   * never reaches another backend. Server side only: never put a key in the page.
   */
  headers?: Record<string, string>;
  /** How long one export may take before it is dropped, in ms. Default `OTEL_EXPORTER_OTLP_TIMEOUT`, else 30000. */
  timeout?: number;
}

/**
 * An OTLP destination. Give a base `endpoint` (`/v1/traces` is appended) or exact `endpoints.traces` (used as given:
 * query strings, tenant paths), never both; with neither, the `OTEL_EXPORTER_OTLP_*` variables decide.
 *
 * @experimental
 *
 * @example
 * otlp({ endpoint: "https://otel.example.com", headers: { "x-api-key": process.env.OTEL_KEY! } })
 * otlp({ endpoints: { traces: "https://traces.example.com/api/ingest/?tenant=acme" } })
 */
export type OtlpTarget = OtlpTargetFields &
  (
    | { endpoint?: undefined; endpoints?: undefined }
    | {
        /** Base collector URL: `/v1/traces` is appended (for `grpc`, used as given). Give this or `endpoints`, never both. */
        endpoint: string;
        endpoints?: undefined;
      }
    | {
        endpoint?: undefined;
        /** Exact per-signal URL, used as given. */
        endpoints: { traces: string };
      }
  );

/** What a `custom` sampler is told about the trace it decides on. */
export interface SamplingContext {
  /** The agent's id, when the run has one. */
  agent?: string;
  /** The conversation the run belongs to. */
  conversation?: string;
  /** The request (server side: the chat request, or the relay's). */
  request?: Request;
}

/**
 * Which traces are exported. `ratio` keeps about that share of traces, decided by trace id so a trace is kept or
 * dropped whole; `custom` decides per trace (a throw drops it).
 *
 * @experimental
 *
 * @example
 * sampling: { type: "ratio", probability: 0.2 }
 * sampling: { type: "custom", sampler: ({ agent }) => agent !== "smalltalk" }
 */
export type Sampling =
  | { type: "always" }
  | { type: "never" }
  | { type: "ratio"; probability: number }
  | { type: "custom"; sampler: (ctx: SamplingContext) => boolean };

/** An OpenTelemetry span context, as the SDK reports it. */
export interface SpanContextLike {
  traceId: string;
  spanId: string;
  traceFlags: number;
  isRemote?: boolean;
}

/** `[seconds, nanoseconds]`, OpenTelemetry's time. */
export type HrTime = [number, number];

/**
 * A finished span as OpenTelemetry's `ReadableSpan` describes it: what a `spanFilter` reads and what exporters get.
 * Only the fields this package uses are typed; a real `ReadableSpan` has them all.
 *
 * @experimental
 */
export interface ReadableSpanLike {
  readonly name: string;
  readonly kind: number;
  spanContext(): SpanContextLike;
  readonly parentSpanContext?: SpanContextLike;
  readonly startTime: HrTime;
  readonly endTime: HrTime;
  readonly status: { code: number; message?: string };
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly events: readonly { name: string; time: HrTime; attributes?: Readonly<Record<string, unknown>> }[];
  readonly instrumentationScope: { name: string; version?: string };
  readonly resource: { attributes: Readonly<Record<string, unknown>> };
}

/** The result an exporter reports: code 0 is success, 1 failure. */
export interface ExportResultLike {
  code: number;
  error?: Error;
}

/**
 * Any OpenTelemetry `SpanExporter` (structural): an in-memory one, an OTLP one, a vendor's.
 *
 * @experimental
 */
export interface SpanExporter {
  export(spans: ReadableSpanLike[], resultCallback: (result: ExportResultLike) => void): void;
  shutdown(): Promise<void>;
  forceFlush?(): Promise<void>;
}

/**
 * Any OpenTelemetry `SpanProcessor` (structural): a vendor's (Langfuse, Braintrust, Arize) or your own.
 *
 * @experimental
 */
export interface SpanProcessor {
  // biome-ignore lint/suspicious/noExplicitAny: an SDK span and context: structural, so the SDK stays an optional install
  onStart(span: any, parentContext: any): void;
  onEnd(span: ReadableSpanLike): void;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Any OpenTelemetry `TracerProvider` (structural): the SDK's, `@vercel/otel`'s, Sentry's, Datadog's.
 *
 * @experimental
 */
export interface TracerProvider {
  // biome-ignore lint/suspicious/noExplicitAny: the API's Tracer: structural, so the API stays an optional install
  getTracer(name: string, version?: string, options?: { schemaUrl?: string }): any;
}

/** Where spans go: a provider to use as is, `"global"` to require the app's registered one, `"own"` never to use it. */
export type TracerProviderOption = TracerProvider | "global" | "own";
