/**
 * browse_category, everywhere. Opens a category's page and lists its products; the cursor clicks that category's link
 * in the header.
 */
import { defineWebTool } from "@webmcp-agents/core";
import { z } from "zod";
import { categorySlugs, getCategory, listByCategory, productLine } from "../../data/catalog.ts";
import { navigate } from "../../lib/navigate.ts";
import { TO_BUY } from "./open-product.ts";

export const browseCategory = defineWebTool({
  id: "browse_category",
  title: "Browse a category",
  description:
    "Open a category page and list its products with slugs and prices. Use when the user wants to see a kind of thing (apparel, accessories, home, digital) or a search found nothing. Next: open_product.",
  inputSchema: z.object({
    category: z
      .enum(categorySlugs)
      .describe("apparel: clothes; accessories: bags, hats, wallets; home: kitchen and decor; digital: downloads"),
  }),
  readOnly: true,

  // the category's link: the first one named like it, in the header
  target: ({ category }) => ({ role: "link", name: getCategory(category)?.name }),

  execute: ({ category }) => {
    navigate(`/category/${category}`);
    const items = listByCategory(category).map(productLine);
    return `Opened ${getCategory(category)?.name}:\n${items.join("\n")}${TO_BUY}`;
  },
  revert: () => {
    if (typeof history !== "undefined" && history.length > 1) history.back();
    else navigate("/");
  },
});
