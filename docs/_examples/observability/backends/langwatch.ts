import { defineObservability } from "@webmcp-agents/telemetry/server";
import { LangWatchExporter } from "langwatch/observability";

// LANGWATCH_API_KEY comes from the environment.
export const observability = defineObservability({
  exporters: [new LangWatchExporter()],
  // The AI SDK's own ai.* spans, which LangWatch's AI SDK guide uses.
  conventions: "legacy",
  // LangWatch groups messages into threads by this key.
  metadataMapping: { "webmcp.conversation.id": "langwatch.thread.id" },
});
