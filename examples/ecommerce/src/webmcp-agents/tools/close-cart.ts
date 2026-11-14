/**
 * close_cart, while the cart drawer is open (`useWebTool(closeCart, { enabled })` in hooks/use-cart-drawer-tools.ts).
 * The cursor presses "Close cart".
 */
import { defineWebTool } from "@webmcp-agents/core";
import { ui } from "../../store/ui.ts";

export const closeCart = defineWebTool({
  id: "close_cart",
  title: "Close cart",
  description: "Close the cart drawer, back to the page behind it. Use when the user is done with the cart. Only while the cart is open.",
  repeatable: true,
  execute: () => {
    ui.closeCart();
    return "Closed the cart.";
  },
  revert: () => {
    ui.openCart();
  },
});
