/**
 * @webmcp-agents/telemetry: the browser side. Observe the page's agent runs and send them, as OpenTelemetry spans, to
 * the app's relay (`/api/telemetry`) or to the page's own OpenTelemetry provider.
 *
 *   import { observeAgents } from "@webmcp-agents/telemetry";
 *   observeAgents({ enabled: () => consent.analytics });
 *
 * The server side (`defineObservability`, the relay) is `@webmcp-agents/telemetry/server`; React's one line is
 * `<ObserveAgents />` from `@webmcp-agents/telemetry/react`. Everything here is experimental in 0.5.0.
 */
export { consoleExporter } from "./browser/console";
export { type AgentSpanOptions, recordAgentEvent, withAgentSpan } from "./browser/custom";
export { observeAgents, type StopObserving } from "./browser/observe";
export type { BrowserSpanExporter, ObserveAgentsOptions, SpanRecord } from "./browser/types";
export * from "./semconv";
export type {
  Attributes,
  AttributeValue,
  CustomAttributes,
  OtlpTarget,
  ReadableSpanLike,
  Sampling,
  SamplingContext,
  SpanExporter,
  SpanProcessor,
  TracerProvider,
  TracerProviderOption,
} from "./shared/types";
