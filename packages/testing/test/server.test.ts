import { createCloudAdapter } from "@webmcp-agents/chat";
import type { AgentStreamPart } from "@webmcp-agents/chat";
import { createChatHandler } from "@webmcp-agents/chat/server";
import { describe, expect, test, vi } from "vitest";
import { mockChatServer } from "../src/chat";
import { chatRequest, mockModel, readChatStream, text, toolCall, withSession } from "../src/server";

const tools = [
  {
    name: "add_to_cart",
    description: "Add a product to the cart.",
    inputSchema: { type: "object", properties: { qty: { type: "number" } } },
  },
];

describe("the endpoint, without a key", () => {
  test("answers a readable stream, and the model records the tools and prompt it was offered", async () => {
    const model = mockModel([toolCall("add_to_cart", { qty: 1 }, { id: "c1" }), text("Added.")]);
    const handler = createChatHandler({ model, env: {} });
    const res = await handler(chatRequest({ messages: ["Add a mug"], tools }));
    expect(res.status).toBe(200);
    const parts = await readChatStream(res);
    expect(parts).toContainEqual(expect.objectContaining({ type: "tool-call", id: "c1", name: "add_to_cart", input: { qty: 1 } }));
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]!.tools.map((t) => t.name)).toEqual(["add_to_cart"]);
    expect(JSON.stringify(model.calls[0]!.prompt)).toContain("Add a mug");
  });

  test("streams text word by word, or in the pieces asked for", async () => {
    const handler = createChatHandler({ model: mockModel([text("One two three.", { chunks: 2 })]), env: {} });
    const parts = await readChatStream(await handler(chatRequest({ messages: ["hi"] })));
    expect(parts.filter((p) => p.type === "text-delta").map((p) => (p as { delta: string }).delta)).toEqual(["One two", " three."]);
  });

  test("guards: no session is 401, another site is 403, and the model is never called", async () => {
    const model = mockModel([text("hi")]);
    const handler = createChatHandler({ model, session: true, env: {} });
    expect((await handler(chatRequest({ messages: ["hi"] }))).status).toBe(401);
    expect((await handler(chatRequest({ messages: ["hi"] }, { origin: "https://evil.example" }))).status).toBe(403);
    expect(model.calls).toHaveLength(0);

    const send = await withSession(handler);
    const parts = await readChatStream(await send(chatRequest({ messages: ["hi"] })));
    expect(parts).toContainEqual(expect.objectContaining({ type: "text-delta", delta: "hi" }));
    expect(model.calls).toHaveLength(1);
  });

  test("helpers fail with sentences", async () => {
    await expect(withSession(createChatHandler({ model: mockModel([text("x")]), env: {} }))).rejects.toThrow("set no session cookie");
    await expect(readChatStream(new Response("{}", { status: 400 }))).rejects.toThrow("the handler answered 400, not a stream");
    expect(() => chatRequest({} as never)).toThrow("chatRequest() needs { messages: [...] }");
    expect(() => mockModel("hi" as never)).toThrow("mockModel() takes a list of steps");
    const never = createChatHandler({ model: mockModel([]), env: {} });
    const res = await never(chatRequest({ messages: ["hi"] }));
    expect(JSON.stringify(await readChatStream(res))).toContain("mockModel([]) was called");
  });
});

describe("the wire, without a server", () => {
  async function collect(adapter: ReturnType<typeof createCloudAdapter>) {
    const parts: AgentStreamPart[] = [];
    const callTool = vi.fn(async () => ({ content: [{ type: "text", text: "Added 1 × Mug." }] }));
    for await (const p of adapter.run({
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Add a mug" }] }],
      tools,
      signal: new AbortController().signal,
      callTool,
    }))
      parts.push(p);
    return { parts, callTool };
  }

  test("the real cloud adapter runs against the mock server, which records every request body", async () => {
    const server = mockChatServer({ steps: [toolCall("add_to_cart", { qty: 1 }), text("Added.")], session: true });
    const { parts, callTool } = await collect(createCloudAdapter({ fetch: server.fetch }));
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "stop" });
    expect(callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "add_to_cart", input: { qty: 1 } }));
    // the adapter's first POST has no session: 401, then it starts one (GET) and retries with the cookie
    expect(server.requests.map((r) => [r.method, !!r.headers.cookie])).toEqual([
      ["POST", false],
      ["GET", false],
      ["POST", true],
      ["POST", true],
    ]);
    expect((server.requests[2]!.body!.tools as { name: string }[]).map((t) => t.name)).toEqual(["add_to_cart"]);
    expect((server.requests[3]!.body!.messages as unknown[]).length).toBe(2); // the tool's output went back
  });

  test("a queued 429 with retry-after is delivered once", async () => {
    const server = mockChatServer({ steps: [text("Hello.")] });
    const adapter = createCloudAdapter({ fetch: server.fetch });
    server.respondOnce({ status: 429, headers: { "retry-after": "30" } });
    const first = await collect(adapter);
    expect(first.parts).toContainEqual(expect.objectContaining({ type: "error", code: "rate_limited" }));
    const second = await collect(adapter);
    expect(second.parts.at(-1)).toEqual({ type: "finish", reason: "stop" });
    const statuses = server.requests.map((r) => r.method);
    expect(statuses.filter((m) => m === "POST").length).toBeGreaterThanOrEqual(2);
  });
});
