import { defineWebTool } from "@webmcp-agents/core";

export const showGiftCode = defineWebTool({
  id: "show_gift_code",
  description:
    "Show the gift card's code on the page. Answers the card's " +
    "balance; the code is for the person, not the agent.",
  // The page and the person get `code`; the model and the stored
  // conversation get "[REDACTED]".
  sensitive: { output: ["code"], hideFromModel: true },
  execute: async () => ({ balance: 25, code: "GIFT-9F3K-2Q7L" }),
});
