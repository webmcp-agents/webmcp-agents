import { expect, test } from "@webmcp-agents/testing";
import {
  mockAdapter,
  text,
  toolCall,
} from "@webmcp-agents/testing/chat";
import { WebAgentsProvider } from "@webmcp-agents/react";

import { Store, storeAgent } from "./app/store";

test("reorders the last purchase", async ({ tools, mount }) => {
  mount(
    <WebAgentsProvider>
      <Store />
    </WebAgentsProvider>,
  );
  await expect.poll(() => tools.list()).toContain("add_to_cart");
  const adapter = mockAdapter([
    toolCall("track_last_order"),
    toolCall("add_to_cart", { id: "mug-01", qty: 2 }),
    text("Back in your cart."),
  ]);

  const run = await storeAgent.invoke("Reorder my last purchase.", {
    adapter,
  });

  expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);
  expect(run).toHaveAnswered("Back in your cart.");
  expect(adapter).toHaveBeenOfferedTools(
    expect.not.arrayContaining(["place_order"]),
  );
});
