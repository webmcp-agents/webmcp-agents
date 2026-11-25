import { defineObservability } from "@webmcp-agents/telemetry/server";

// The endpoint and key come from the environment.
export const observability = defineObservability({
  // Laminar groups traces into sessions by this key.
  metadataMapping: {
    "webmcp.conversation.id": "lmnr.association.properties.session_id",
  },
});
