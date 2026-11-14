/**
 * open_product, everywhere. Answers the product's options, then opens its page with the router (src/lib/navigate.ts),
 * within the document, so the call is never cancelled by its own navigation. The cursor clicks the product's card when
 * the page lists it.
 */
import { defineWebTool, WebToolError } from "@webmcp-agents/core";
import { z } from "zod";
import { describeProduct, findProduct, type Product, searchProducts } from "../../data/catalog.ts";
import { navigate } from "../../lib/navigate.ts";

/** Where to go from a list of products: add_to_cart only exists on a product's page. */
export const TO_BUY = "\nNext (for you, the assistant): call open_product with a slug, then add_to_cart.";

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
    "Open one product's page and answer its price, sizes and stock. Use after search_products or browse_category, with a slug they listed (or words from the name). Next: add_to_cart, which only exists on that page.",
  inputSchema: z.object({
    slug: z.string().optional().describe("The product's slug as search_products, browse_category or get_cart list it, e.g. ocean-tee"),
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
    // An exact slug, else the best search match: agents guess slugs ("tee" for "ocean-tee"), and a near miss that
    // opens the right page beats an error a small model won't recover from. Empty calls (after restore, or a thin
    // model) while already on a product page use that path's slug.
    const wanted = slug?.trim() || pathProductSlug();
    const search = query?.trim() || undefined;
    if (!wanted && !search) {
      throw new WebToolError(
        "invalid_input",
        "Pass a slug (e.g. ocean-tee) or a query (e.g. linen shirt). Call search_products first if you do not have one.",
      );
    }

    let product: Product | undefined = wanted ? findProduct(wanted) : undefined;
    let others: Product[] = [];
    if (!product) {
      const q = search ?? wanted!.replace(/-/g, " ");
      [product, ...others] = searchProducts(q);
      if (!product) throw new WebToolError("invalid_input", `No product matches "${q}". Try search_products with other words.`);
    }

    navigate(`/product/${product.slug}`);

    const next =
      product.stock === 0
        ? "It's sold out: it can't be added to the cart."
        : "Next (for you, the assistant): call add_to_cart, now on this page.";
    const alsoMatched = others.length
      ? ` Best match for "${search ?? wanted}"; also matched: ${others
          .slice(0, 4)
          .map((p) => p.slug)
          .join(", ")}.`
      : "";
    return `Opened ${describeProduct(product)} ${next}${alsoMatched}`;
  },
  revert: () => {
    if (typeof history !== "undefined" && history.length > 1) history.back();
    else navigate("/");
  },
});
