import { defineWebTool } from "@webmcp-agents/core";
import { z } from "zod";

import { cart } from "../../shared/lib/cart";

const mugs: Record<string, { name: string; price: number }> = {
  "mug-01": { name: "Field Mug", price: 18 },
};

export const addToCart = defineWebTool({
  id: "add_to_cart",
  description:
    "Add a mug to the cart. Use when the user wants to buy one. " +
    "Answers the line added.",
  inputSchema: z.object({
    id: z.string().describe('The mug\'s id, e.g. "mug-01".'),
    qty: z.number().int().min(1).describe("How many, e.g. 2."),
  }),
  execute: async ({ id, qty }) => {
    const mug = mugs[id];
    if (!mug) throw new Error(`No mug "${id}".`);
    cart.add({ id, name: mug.name, quantity: qty, price: mug.price });
    return `Added ${qty} × ${mug.name}.`;
  },
});
