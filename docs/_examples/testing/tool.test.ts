import { callTool, expect, test } from "@webmcp-agents/testing";

import { addToCart } from "./app/add-to-cart";

// In Node: no page, no cursor. callTool runs the tool's schema and
// execute, and answers what the agent would read.
test("adds the quantity", async () => {
  const result = await callTool(addToCart, { id: "mug-01", qty: 2 });
  expect(result).toBeToolResult(/2 × Field Mug/);
});

test("answers a schema error instead of throwing", async () => {
  const result = await callTool(addToCart, { id: "mug-01", qty: 0 });
  expect(result).toBeToolError("invalid_input");
});
