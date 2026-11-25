// A stand-in for
// @opentelemetry/exporter-trace-otlp-proto
// so the recipes type-check without installing it (tsconfig and
// knip.json map the name here). Read from its docs and published
// package on 2026-11-25.
import type { SpanExporter } from "@webmcp-agents/telemetry/server";
export declare class OTLPTraceExporter implements SpanExporter {
  constructor(options?: {
    url?: string;
    headers?: Record<string, string>;
  });
  export: SpanExporter["export"];
  shutdown: SpanExporter["shutdown"];
}
