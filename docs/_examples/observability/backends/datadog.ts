import { defineObservability } from "@webmcp-agents/telemetry/server";

// The endpoint and key come from the environment.
export const observability = defineObservability({
  // LLM Observability builds sessions from this key.
  metadataMapping: {
    "webmcp.conversation.id": "gen_ai.conversation.id",
  },
});
