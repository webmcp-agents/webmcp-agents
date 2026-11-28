import { createHelicone } from "@helicone/ai-sdk-provider";
import { createChatHandler } from "@webmcp-agents/chat/server";

import { agents } from "../../shared/agents";

// Helicone sits between the chat and the model: every model call is
// logged there. It is not where the layer's spans go.
const helicone = createHelicone({
  apiKey: process.env.HELICONE_API_KEY,
});

export const POST = createChatHandler({
  agents,
  model: helicone("claude-4.5-haiku"),
});
