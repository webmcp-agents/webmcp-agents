/**
 * open_cart, everywhere. Shows the drawer, whose own tools (update_cart_item, remove_from_cart, close_cart) are on
 * while it is open. The cursor presses the header's cart button, named "Cart, 2 items".
 */
import { defineWebTool } from "@webmcp-agents/core";
import { cart } from "../../store/cart.ts";
import { ui } from "../../store/ui.ts";

export const openCart = defineWebTool({
  id: "open_cart",
  title: "Open the cart",
  description:
    "Show the cart drawer to the user and list its lines. Needed first for update_cart_item and remove_from_cart, which only exist while it's open. Next: change a line, close_cart, or go_to_page checkout.",
  repeatable: true,
  target: { role: "button", name: /^Cart, / },
  execute: () => {
    if (ui.cartOpen) return "The cart is already open.";
    ui.openCart();
    return `Opened the cart.\n${cart.describe()}`;
  },
  revert: () => {
    ui.closeCart();
  },
});
