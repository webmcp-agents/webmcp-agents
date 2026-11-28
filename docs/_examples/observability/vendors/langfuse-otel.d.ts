// A stand-in for
// @langfuse/otel
// so the recipes type-check without installing it (tsconfig and
// knip.json map the name here). Read from its docs and published
// package on 2026-11-25.
import type { SpanProcessor } from "@webmcp-agents/telemetry/server";
export declare class LangfuseSpanProcessor implements SpanProcessor {
  constructor(options?: {
    publicKey?: string;
    secretKey?: string;
    baseUrl?: string;
    environment?: string;
  });
  onStart: SpanProcessor["onStart"];
  onEnd: SpanProcessor["onEnd"];
  forceFlush: SpanProcessor["forceFlush"];
  shutdown: SpanProcessor["shutdown"];
}
