import { createChatHandler } from "@webmcp-agents/chat/server";
import { expect, test } from "@webmcp-agents/testing";
import {
  chatRequest,
  mockModel,
  readChatStream,
  toolCall,
  withSession,
} from "@webmcp-agents/testing/server";

import { addToCart } from "./app/add-to-cart";

const model = mockModel([
  toolCall("add_to_cart", { id: "mug-01", qty: 1 }),
]);
const handler = createChatHandler({
  model,
  tools: [addToCart],
  session: true,
});
const hi = { messages: ["hi"] };

test("needs a session", async () => {
  expect((await handler(chatRequest(hi))).status).toBe(401);
});

test("refuses another site", async () => {
  const evil = { origin: "https://evil.example" };
  expect((await handler(chatRequest(hi, evil))).status).toBe(403);
});

test("drops tools off the allowlist", async () => {
  const send = await withSession(handler);
  const tools = ["add_to_cart", "delete_everything"];
  const res = await send(chatRequest({ ...hi, tools }));
  const parts = await readChatStream(res);

  expect(parts).toContainEqual(
    expect.objectContaining({ type: "tool-call", name: "add_to_cart" }),
  );
  const offered = model.calls[0]?.tools.map((tool) => tool.name);
  expect(offered).toEqual(["add_to_cart"]);
});
