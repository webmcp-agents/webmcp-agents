/** go_to_page: everywhere. Home, the cart, or checkout (which needs something in the cart). */
import { defineWebTool, WebToolError } from "@webmcp-agents/core";
import { z } from "zod";
import { cart } from "@/lib/cart-store";
import { navigate } from "@/lib/navigate";

const PAGES = { home: "/", cart: "/cart", checkout: "/checkout" } as const;
/** The header's links: the store's name for home, "Cart (2)" for the cart. Checkout has none in the header. */
const LINKS = { home: "Field Store", cart: /^Cart \(/ } as const;

/**
 * Not `goTo` from @webmcp-agents/tools: checkout has no link in the header (it would load the page and lose the chat),
 * and it needs a cart with something in it.
 */
export const goToPage = defineWebTool({
  id: "go_to_page",
  title: "Go to a page",
  description:
    "Go to the home page, the cart, or checkout. Use before apply_promo and checkout (they only exist on the checkout page). For one product use open_product.",
  inputSchema: z.object({
    page: z
      .enum(["home", "cart", "checkout"])
      .describe("home: every product; cart: what is in the cart; checkout: pay for the cart (needs items in it)"),
  }),
  readOnly: true,
  target: ({ page }) => (page === "checkout" ? undefined : { role: "link", name: LINKS[page] }),
  execute: ({ page }) => {
    if (page === "checkout" && cart.describe().startsWith("The cart is empty"))
      throw new WebToolError("failed", "The cart is empty: add something first (open_product, then add_to_cart).");
    navigate(PAGES[page]);
    if (page === "checkout")
      return "Opened checkout. Next: checkout with the user's email, name, address and country (ask for what you don't have); apply_promo for a code.";
    return page === "home" ? "Opened the home page." : "Opened the cart.";
  },
  revert: () => {
    if (typeof history !== "undefined" && history.length > 1) history.back();
    else navigate("/");
  },
});
