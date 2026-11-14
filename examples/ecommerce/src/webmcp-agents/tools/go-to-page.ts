/**
 * go_to_page, everywhere. Not `goTo` from @webmcp-agents/tools: checkout has no link to click (a full page load would
 * lose the chat) and needs a cart with something in it. The cursor clicks the header's link for the page: the logo
 * for home, "All products"; checkout runs unseen.
 */
import { defineWebTool, WebToolError } from "@webmcp-agents/core";
import { z } from "zod";
import { searchProducts } from "../../data/catalog.ts";
import { navigate } from "../../lib/navigate.ts";
import { cart } from "../../store/cart.ts";
import { TO_BUY } from "./open-product.ts";

const PAGES = { home: "/", "all-products": "/products", checkout: "/checkout" } as const;

/** The header link each page has. Checkout has none. */
const LINKS = { home: "Field Store", "all-products": "All products" } as const;

export const goToPage = defineWebTool({
  id: "go_to_page",
  title: "Go to a page",
  description:
    'Go to the home page, the page with every product, or checkout. Use for "go home", "show everything", or before apply_promo and checkout (they only exist on the checkout page). For a category use browse_category; for one product, open_product.',
  inputSchema: z.object({
    page: z
      .enum(["home", "all-products", "checkout"])
      .describe("home: the front page; all-products: every product; checkout: pay for the cart (needs items in it)"),
  }),
  readOnly: true,

  target: ({ page }) => (page === "checkout" ? undefined : { role: "link", name: LINKS[page] }),

  execute: ({ page }) => {
    if (page === "checkout" && cart.describe().startsWith("The cart is empty"))
      throw new WebToolError("failed", "The cart is empty: add something first (open_product, then add_to_cart).");

    navigate(PAGES[page]);

    if (page === "home") return "Opened the home page.";
    if (page === "checkout")
      return "Opened checkout. Next: checkout with the user's email and address (ask for what you don't have); apply_promo for a code.";
    return `Opened all products (${searchProducts("").length}).${TO_BUY}`;
  },
  // chat restore: leave the page the tool opened
  revert: () => {
    if (typeof history !== "undefined" && history.length > 1) history.back();
    else navigate("/");
  },
});
