import { defineObservability } from "@webmcp-agents/telemetry/server";

// The endpoint, headers and protocol come from the environment.
export const observability = defineObservability({
  // LangSmith groups traces into threads by this key.
  metadataMapping: {
    "webmcp.conversation.id": "langsmith.trace.session_id",
  },
});
