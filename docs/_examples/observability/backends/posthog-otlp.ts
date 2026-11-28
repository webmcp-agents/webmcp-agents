import { defineObservability } from "@webmcp-agents/telemetry/server";

// The endpoint and token come from the environment.
export const observability = defineObservability({
  // PostHog derives its session from this key.
  metadataMapping: {
    "webmcp.conversation.id": "gen_ai.conversation.id",
  },
});
