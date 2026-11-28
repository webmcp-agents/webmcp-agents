import { defineObservability } from "@webmcp-agents/telemetry/server";

// Copy the conversation id to the key your backend groups by. The
// copy is exported raw: map ids, never content.
export const observability = defineObservability({
  metadataMapping: { "webmcp.conversation.id": "session.id" },
});
