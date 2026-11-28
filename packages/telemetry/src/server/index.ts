/**
 * @webmcp-agents/telemetry/server: the chat handler's observability layer and the relay for the browser's spans.
 *
 *   import { defineObservability } from "@webmcp-agents/telemetry/server";
 *   export const observability = defineObservability();          // OTEL_* env decides where spans go
 *   export const POST = createChatHandler({ agents, observability });
 *   // app/api/telemetry/route.ts
 *   export const POST = observability.relay();
 *
 * Everything here is experimental in 0.5.0.
 */
export { resolveTarget } from "./config";
export { defineObservability, otlp } from "./observability";
export { RELAY_MAX_BYTES } from "./relay";
export type { CustomSpanOptions, Observability, ObservabilityConfig, TelemetryRelayOptions } from "./types";
export * from "../semconv";
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
} from "../shared/types";
