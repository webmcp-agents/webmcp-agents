import { expect, test } from "@webmcp-agents/testing";
import {
  mockAdapter,
  text,
  toolCall,
} from "@webmcp-agents/testing/chat";
import { WebAgentsProvider } from "@webmcp-agents/react";

import { Store, storeAgent } from "./app/store";

test("one run is one trace", async ({ tools, spans, mount }) => {
  mount(
    <WebAgentsProvider>
      <Store />
    </WebAgentsProvider>,
  );
  await expect.poll(() => tools.list()).toContain("add_to_cart");

  const adapter = mockAdapter([
    toolCall("add_to_cart", { id: "mug-01", qty: 2 }),
    text("Added."),
  ]);
  await storeAgent.invoke("Two mugs.", { adapter });
  await spans.flush();

  expect(spans).toHaveSpan("invoke_agent store");
  expect(spans).toHaveSpan("execute_tool add_to_cart", {
    "webmcp.tool.state": "done",
  });
  expect(spans).toBeOneTrace();
});
