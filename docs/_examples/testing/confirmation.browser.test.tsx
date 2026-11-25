import { expect, test } from "@webmcp-agents/testing";
import { WebAgentsProvider } from "@webmcp-agents/react";

import { Checkout } from "./app/checkout";
import { orders } from "./app/orders";

test("waits for the person before placing the order", async ({
  tools,
  events,
  user,
  mount,
}) => {
  orders.clear();
  mount(
    <WebAgentsProvider>
      <Checkout />
    </WebAgentsProvider>,
  );
  await expect.poll(() => tools.list()).toContain("place_order");

  const call = tools.call("place_order");
  await expect.poll(() => events).toHaveParked("place_order");
  expect(orders.get()).toHaveLength(0);

  // A trusted click on the parked control.
  await user.confirm("Place order");
  expect(await call).toBeToolResult();
  expect(orders.get()).toHaveLength(1);
});

test("gives up when the person moves on", async ({
  tools,
  events,
  user,
  mount,
}) => {
  mount(
    <WebAgentsProvider>
      <Checkout />
    </WebAgentsProvider>,
  );
  await expect.poll(() => tools.list()).toContain("place_order");

  const call = tools.call("place_order");
  await expect.poll(() => events).toHaveParked();
  // A trusted click away from the control.
  await user.moveOn();
  expect(await call).toBeToolError("cancelled");
});
