import { LangfuseSpanProcessor } from "@langfuse/otel";
import { defineObservability } from "@webmcp-agents/telemetry/server";

// LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY and LANGFUSE_BASE_URL
// come from the environment.
export const observability = defineObservability({
  spanProcessors: [new LangfuseSpanProcessor()],
  // Langfuse groups traces into sessions by this key.
  metadataMapping: { "webmcp.conversation.id": "langfuse.session.id" },
});
