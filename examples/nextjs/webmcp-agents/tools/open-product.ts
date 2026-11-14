/**
 * open_product: everywhere. Opens a product's page with the App Router (lib/navigate.ts); the cursor clicks the
 * product's card when the page lists it.
 */
import { defineWebTool, WebToolError } from "@webmcp-agents/core";
import { z } from "zod";
import { describeProduct, findProduct, type Product, searchProducts } from "@/lib/catalog";
import { navigate } from "@/lib/navigate";

/** Product slug from `/product/<slug>` when the agent omits args (common after restore). */
function pathProductSlug(): string | undefined {
  if (typeof location === "undefined") return undefined;
  const match = location.pathname.match(/^\/product\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export const openProduct = defineWebTool({
  id: "open_product",
  title: "Open a product page",
  description:
    "Open one product's page and answer its price, sizes and stock. Use after search_products, with a slug it listed (or words from the name). Next: add_to_cart, which only exists on that page.",
  inputSchema: z.object({
    slug: z.string().optional().describe("The product's slug as search_products lists it, e.g. ocean-tee"),
    query: z.string().optional().describe("When you have no slug: words from the product's name, e.g. linen shirt"),
  }),
  readOnly: true,
  // the product's card, when the page lists it ("Ocean Tee $48.00" starts with its name); elsewhere it runs unseen
  target: ({ slug }) => {
    const wanted = slug?.trim() || pathProductSlug();
    const name = wanted && findProduct(wanted)?.name;
    return name ? { role: "link", name } : undefined;
  },
  execute: ({ slug, query }) => {
    const wanted = slug?.trim() || pathProductSlug();
    const search = query?.trim() || undefined;
    if (!wanted && !search) {
      throw new WebToolError(
        "invalid_input",
        "Pass a slug (e.g. ocean-tee) or a query (e.g. linen shirt). Call search_products first if you do not have one.",
      );
    }
    let product: Product | undefined = wanted ? findProduct(wanted) : undefined;
    if (!product) {
      const q = search ?? wanted!.replace(/-/g, " ");
      [product] = searchProducts(q);
      if (!product) throw new WebToolError("invalid_input", `No product matches "${q}". Try search_products with other words.`);
    }
    navigate(`/product/${product.slug}`);
    return `Opened ${describeProduct(product)} Next (for you, the assistant): call add_to_cart, now on this page.`;
  },
  revert: () => {
    if (typeof history !== "undefined" && history.length > 1) history.back();
    else navigate("/");
  },
});
