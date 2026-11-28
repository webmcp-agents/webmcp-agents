import { expect, test, uniqueName } from "@webmcp-agents/testing";
import { WebAgentsProvider } from "@webmcp-agents/react";

import { QuantityForm } from "./app/quantity-form";

test("types the quantity where the person sees it", async ({
  tools,
  events,
  mount,
}) => {
  mount(
    <WebAgentsProvider>
      <QuantityForm />
    </WebAgentsProvider>,
  );
  await expect.poll(() => tools.list()).toContain("set_quantity");

  const result = await tools.call("set_quantity", { qty: 3 });

  expect(result).toBeToolResult("Quantity set to 3.");
  expect(events).toHaveFilled("qty", "3");
  expect(events).toHaveEventOrder(["start", "fill", "result"]);
});

test("a stand-in tool answers what you tell it", async ({ tools }) => {
  // One page per test file: a unique name keeps tests apart.
  const name = uniqueName("check_stock");
  const stock = tools.mock(name, async () => "4 left.");

  expect(await tools.call(name, { id: "mug-01" })).toBeToolResult(
    "4 left.",
  );
  expect(stock).toHaveBeenCalledOnce();
});
