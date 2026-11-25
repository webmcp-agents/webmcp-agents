import { defineObservability } from "@webmcp-agents/telemetry/server";

// Nothing to pass: Sentry's provider is found and used.
export const observability = defineObservability({
  // Sentry groups AI spans into conversations by this key.
  metadataMapping: {
    "webmcp.conversation.id": "gen_ai.conversation.id",
  },
});
