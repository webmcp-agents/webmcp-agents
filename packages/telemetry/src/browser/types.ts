import type { RedactOptions, Redactor } from "@webmcp-agents/core/redact";
import type { Attributes, OtlpTarget, Sampling, TracerProviderOption } from "../shared/types";

/**
 * A finished browser span: a run (`invoke_agent`), a tool call (`execute_tool`), for an on-device run a model step
 * (`chat`), or the app's own (`withAgentSpan`, named as the app named it, with `webmcp.custom: true`). Times are milliseconds since the epoch. What `spanFilter` and a {@link BrowserSpanExporter} receive,
 * already redacted.
 *
 * @experimental
 */
export interface SpanRecord {
  /** `invoke_agent <agent>`, `execute_tool <tool>`, `chat <model>`, or a custom span's own name. */
  name: string;
  /** 32 hex digits: the run's trace, shared with the server's spans of the same run. */
  traceId: string;
  /** 16 hex digits. A run span's id is the one its `traceparent` carries, so the server's step spans are its children. */
  spanId: string;
  /** The parent span: the run for a call or step; the delegating call for a sub-agent's run. */
  parentSpanId?: string;
  /** Start, ms since the epoch. */
  startTime: number;
  /** End, ms since the epoch. */
  endTime: number;
  /** The span's attributes (names in `semconv`). */
  attributes: Attributes;
  /** `webmcp.park`, `webmcp.yield`, `webmcp.resume` on a tool call; the app's own (`recordAgentEvent`) on a run. */
  events: { name: string; time: number; attributes?: Attributes }[];
  /** `error` for a failed run, call or custom span (with `error.type` set), else `unset`. */
  status: { code: "unset" | "ok" | "error"; message?: string };
}

/**
 * Where browser spans go when they are not sent to the relay: any object with `export`. A throw or rejection is
 * swallowed (the page never breaks for telemetry).
 *
 * @experimental
 *
 * @example
 * observeAgents({ exporters: [{ export: (spans) => analytics.track("agent_spans", { count: spans.length }) }] });
 */
export interface BrowserSpanExporter {
  /** Called with a batch of finished, redacted spans. */
  export(spans: readonly SpanRecord[]): void | Promise<void>;
  /** Send anything held back (called when the page is hidden and when observing stops). */
  flush?(): Promise<void>;
}

/**
 * Options for `observeAgents()` / `<ObserveAgents>`. Every field is optional.
 *
 * @experimental
 */
export interface ObserveAgentsOptions {
  /**
   * Where spans go. Default: the page's global tracer provider when one is registered (the OpenTelemetry Web SDK,
   * Sentry, Datadog RUM), else the app's relay at `"/api/telemetry"`. A string is the URL of a relay; an OTLP target
   * posts OTLP JSON straight to a collector (its headers end up in the page: never put a key there). `[]` sends
   * nothing and builds no span.
   */
  exporters?: readonly (string | OtlpTarget | BrowserSpanExporter)[];
  /** A provider to use as is, `"global"` to require the page's registered one, or `"own"` never to use it. Default: the global one when registered. */
  tracerProvider?: TracerProviderOption;
  /** `service.name` of the browser's spans. Default `location.host`. */
  serviceName?: string;
  /** Which runs are exported, decided at each run's start. Default `{ type: "always" }`. */
  sampling?: Sampling;
  /** Put tool inputs on `execute_tool` spans (`gen_ai.tool.call.arguments`), redacted. Default false. */
  recordInputs?: boolean;
  /** Put tool results on `execute_tool` spans (`gen_ai.tool.call.result`), redacted. Default false. */
  recordOutputs?: boolean;
  /**
   * Redaction of everything exported. Default: the page's redactor (`configureRedaction`), read at each use. `false`
   * only for local debugging.
   */
  redact?: false | RedactOptions | Redactor;
  /**
   * Consent: read when each run starts; `false` and that run produces no span and no request. Default `() => true`.
   *
   * @example
   * observeAgents({ enabled: () => consent.analytics })
   */
  enabled?: () => boolean;
  /** Keep (true) or drop (false) a span, after redaction. A throw drops it. */
  spanFilter?: (span: SpanRecord) => boolean;
  /** Copy an attribute to the name a backend groups by, e.g. `{ "webmcp.conversation.id": "session.id" }`. */
  metadataMapping?: Record<string, string>;
  /** Send at most this often, in ms. Default 2000. */
  batchMs?: number;
  /** Send sooner once this many spans are waiting. Default 64. */
  batchSize?: number;
}
