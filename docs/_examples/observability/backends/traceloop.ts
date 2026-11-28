import { defineObservability } from "@webmcp-agents/telemetry/server";

// The endpoint and key come from the environment.
export const observability = defineObservability({
  // Traceloop filters by any association property.
  metadataMapping: {
    "webmcp.conversation.id":
      "traceloop.association.properties.conversation_id",
  },
});
