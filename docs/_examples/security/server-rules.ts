import { createChatHandler } from "@webmcp-agents/chat/server";
import { defineWebAgent } from "@webmcp-agents/chat/agent";

const shopper = defineWebAgent({
  id: "shopper",
  instructions: "Help the person shop.",
});

// The server's own rules: its logs, model errors and refusals.
export const POST = createChatHandler({
  agents: [shopper],
  redact: { keys: (defaults) => [...defaults, "tenantSecret"] },
});
