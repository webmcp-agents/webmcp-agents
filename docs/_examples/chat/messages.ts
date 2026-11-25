import { defineChatMessages } from "@webmcp-agents/chat";

// Any subset of the catalog. A string may hold {placeholders}; a
// function is there for what a template cannot say.
export const messages = defineChatMessages({
  title: "Field Store assistant",
  composer: { placeholder: "Ask about an order, or what to add" },
  tool: {
    running: ({ tool }) => `Working on ${tool.replaceAll("_", " ")}…`,
    awaitingConfirmation: "Click the highlighted button to confirm",
  },
  steps: "{count, plural, one {# step} other {# steps}}",
  errors: { rate_limited: "Too many messages. Give it a minute." },
});
