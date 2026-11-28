import { defineWebAgent } from "@webmcp-agents/chat/agent";
import { useWebTool } from "@webmcp-agents/react";

import { addToCart } from "./add-to-cart";

export const storeAgent = defineWebAgent({
  id: "store",
  instructions: [
    "You help people shop at Field Store.",
    "track_last_order says what they bought last.",
  ],
});

export function Store() {
  useWebTool({
    id: "track_last_order",
    description: "Read the last order: what was bought.",
    readOnly: true,
    execute: () => ({ id: "mug-01", qty: 2 }),
  });
  useWebTool(addToCart);
  return <h1>Field Store</h1>;
}
