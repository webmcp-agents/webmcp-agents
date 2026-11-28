// A stand-in for
// @posthog/ai/otel
// so the recipes type-check without installing it (tsconfig and
// knip.json map the name here). Read from its docs and published
// package on 2026-11-25.
import type { SpanExporter } from "@webmcp-agents/telemetry/server";
export declare class PostHogTraceExporter implements SpanExporter {
  constructor(options: { projectToken: string; host?: string });
  export: SpanExporter["export"];
  shutdown: SpanExporter["shutdown"];
}
