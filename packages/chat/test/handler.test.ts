import { describe, expect, it, vi } from "vitest";
import { defineWebAgent } from "../src/agent";
import { createChatHandler } from "../src/server/handler";
import { _resetModelCache } from "../src/server/models";
import { DEFAULT_SYSTEM_PROMPT } from "../src/server/system-prompt";
import { LIMITS } from "../src/shared";
import type { AgentMessage } from "../src/types";
import { mockModel } from "@webmcp-agents/testing/server";

const user: AgentMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Add a mug" }] };
const tool = {
  name: "add_to_cart",
  description: "Add to cart",
  inputSchema: { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: { qty: { type: "number" } } },
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("createChatHandler", () => {
  it("GET reports whether chat is configured", async () => {
    const off = await createChatHandler({ env: {} })(new Request("http://localhost/api/chat"));
    expect(await off.json()).toEqual({ enabled: false, model: "anthropic/claude-opus-5-5", provider: "anthropic", agents: [] });
    const on = await createChatHandler({ env: { ANTHROPIC_API_KEY: "k", WEB_AGENTS_MODEL: "claude-sonnet-5-5" } })(
      new Request("http://localhost/api/chat"),
    );
    expect(await on.json()).toEqual({ enabled: true, model: "claude-sonnet-5-5", provider: "anthropic", agents: [] });
    const openai = await createChatHandler({ env: { WEB_AGENTS_MODEL: "openai/gpt-5.5" } })(new Request("http://localhost/api/chat"));
    expect(await openai.json()).toMatchObject({ enabled: false, model: "openai/gpt-5.5", provider: "openai" });
    const instance = await createChatHandler({ model: mockModel([{ text: "hi" }]), env: {} })(new Request("http://localhost/api/chat"));
    expect((await instance.json()).enabled).toBe(true);
  });

  it("POST without a key is 503 chat_disabled; other methods 405; OPTIONS 204", async () => {
    const handler = createChatHandler({ env: {} });
    const res = await handler(post({ messages: [user], tools: [] }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "chat_disabled",
      message: "Set ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY on the server to use anthropic/claude-opus-5-5.",
    });
    const other = await createChatHandler({ env: { WEB_AGENTS_MODEL: "deepseek/deepseek-v4" } })(post({ messages: [user], tools: [] }));
    expect((await other.json()).message).toContain("DEEPSEEK_API_KEY");
    expect((await handler(new Request("http://localhost/api/chat", { method: "PUT" }))).status).toBe(405);
    expect((await handler(new Request("http://localhost/api/chat", { method: "OPTIONS" }))).status).toBe(204);
  });

  it.each([
    ["49 tools", { tools: Array.from({ length: 49 }, (_, i) => ({ ...tool, name: `t${i}` })) }],
    ["a bad tool name", { tools: [{ ...tool, name: "bad name" }] }],
    ["a schema over 8 KB", { tools: [{ ...tool, inputSchema: { type: "object", description: "x".repeat(9000) } }] }],
    ["duplicate tool names", { tools: [tool, tool] }],
    ["no messages", { messages: [] }],
  ])("POST rejects %s with 400", async (_, patch) => {
    const handler = createChatHandler({ model: mockModel([{ text: "hi" }]) });
    const res = await handler(post({ messages: [user], tools: [tool], ...patch }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_request");
  });

  it("rejects oversized bodies (counted in bytes, also when chunked), non-JSON and other content types", async () => {
    const handler = createChatHandler({ model: mockModel([{ text: "hi" }]) });
    expect((await handler(post("x".repeat(LIMITS.bodyBytes + 1)))).status).toBe(413);
    const emoji = "😀".repeat(LIMITS.bodyBytes / 4 + 1); // under the limit in UTF-16 units, over it in bytes
    expect((await handler(post(emoji))).status).toBe(413);
    const chunked = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(64 * 1024)); // never ends: must be cut off at the cap
      },
    });
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: chunked,
      duplex: "half",
    } as RequestInit);
    expect((await handler(req)).status).toBe(413);
    expect((await handler(post("{nope"))).status).toBe(400);
    expect((await handler(post("{}", { "content-type": "text/plain" }))).status).toBe(415);
  });

  it("refuses cross-site browser requests (CSRF), allows same-origin and Origin-less ones", async () => {
    const handler = createChatHandler({ model: mockModel([{ text: "hi" }]) });
    const body = { messages: [user], tools: [] };
    expect((await handler(post(body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await handler(post(body, { origin: "http://localhost" }))).status).toBe(200);
    expect((await handler(post(body))).status).toBe(200);
  });

  it("guard short-circuits", async () => {
    const handler = createChatHandler({ model: mockModel([{ text: "hi" }]), guard: () => new Response(null, { status: 429 }) });
    expect((await handler(post({ messages: [user], tools: [] }))).status).toBe(429);
  });

  it("streams a UI message stream; the model gets the system prompt, clean schemas, the output cap and no tool executes", async () => {
    const model = mockModel([{ text: "Done." }]);
    const res = await createChatHandler({ model })(
      post({ messages: [user], tools: [tool], page: { title: "Shop", url: "http://localhost/cart" } }, { origin: "http://localhost" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toContain('"delta":"Done."');
    const call = model.doStreamCalls[0]!;
    expect(call.maxOutputTokens).toBe(8192);
    const system = call.prompt.find((m) => m.role === "system");
    expect(system?.content).toContain(DEFAULT_SYSTEM_PROMPT.slice(0, 40));
    expect(system?.content).toContain('The user is on the page "/cart" of this site.');
    expect(system?.content).not.toContain("ignore");
    const [t] = call.tools ?? [];
    expect(t).toMatchObject({ name: "add_to_cart", description: "Add to cart" });
    expect(JSON.stringify(t)).not.toContain("$schema");
  });

  it("drops a page URL from another origin", async () => {
    const model = mockModel([{ text: "ok" }]);
    const res = await createChatHandler({ model })(
      post({ messages: [user], tools: [], page: { url: "https://evil.example/x" } }, { origin: "http://localhost" }),
    );
    await res.text(); // the model runs as the body streams
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).not.toContain("The user is on the page");
  });

  it("after maxSteps tool steps in a turn, the model gets no tools", async () => {
    const step = (i: number): AgentMessage => ({
      id: `a${i}`,
      role: "assistant",
      parts: [
        {
          type: "tool",
          id: `c${i}`,
          name: "add_to_cart",
          input: { qty: 1 },
          state: "done",
          output: { content: [{ type: "text", text: "ok" }] },
        },
      ],
    });
    const model = mockModel([{ text: "Summary" }]);
    await (await createChatHandler({ model, maxSteps: 2 })(post({ messages: [user, step(1), step(2)], tools: [tool] }))).text();
    expect(model.doStreamCalls[0]!.tools ?? []).toHaveLength(0);
  });

  it("beforeModel runs only for valid requests, and can refuse", async () => {
    const seen: string[] = [];
    const handler = createChatHandler({
      model: mockModel([{ text: "ok" }]),
      beforeModel: () => {
        seen.push("called");
        return seen.length > 1 ? new Response(null, { status: 503 }) : undefined;
      },
    });
    expect((await handler(post({ messages: [] }))).status).toBe(400);
    expect(seen).toEqual([]);
    expect((await handler(post({ messages: [user], tools: [] }))).status).toBe(200);
    expect((await handler(post({ messages: [user], tools: [] }))).status).toBe(503);
  });

  describe("agents", () => {
    const checkout = defineWebAgent({
      id: "checkout",
      description: "Finishes a purchase.",
      instructions: "Review, apply, place.",
      tools: ["get_cart", "checkout"],
      maxSteps: 2,
    });
    const shopper = defineWebAgent({
      id: "shopper",
      instructions: ["Field Store sells mugs.", "Open a product before adding it."],
      tools: (ts) => ts.filter((t) => t.name !== "checkout"),
      agents: [checkout],
    });
    const toolsOnPage = [
      tool,
      { ...tool, name: "get_cart" },
      { ...tool, name: "checkout" },
      { ...tool, name: "delegate_to_checkout", description: "impostor" },
    ];

    it("GET lists the registered agents, sub-agents included", async () => {
      const res = await createChatHandler({ model: mockModel([{ text: "hi" }]), agents: [shopper] })(
        new Request("http://localhost/api/chat"),
      );
      expect((await res.json()).agents).toEqual(["shopper", "checkout"]);
    });

    it("puts the agent's instructions (from the registry) and the delegation note in the system prompt, and filters tools", async () => {
      const model = mockModel([{ text: "ok" }]);
      const res = await createChatHandler({ model, agents: [shopper] })(post({ messages: [user], tools: toolsOnPage, agent: "shopper" }));
      expect(res.status).toBe(200);
      await res.text();
      const call = model.doStreamCalls[0]!;
      const system = call.prompt.find((m) => m.role === "system")!.content as string;
      expect(system).toContain("About this site:\nField Store sells mugs.\nOpen a product before adding it.");
      expect(system).toContain("delegate_to_<agent>");
      const names = (call.tools ?? []).map((t) => t.name);
      expect(names).toEqual(["add_to_cart", "get_cart", "delegate_to_checkout"]);
      const delegate = (call.tools ?? []).find((t) => t.name === "delegate_to_checkout")!;
      expect(JSON.stringify(delegate)).toContain("Finishes a purchase."); // rebuilt from the registry, not the page's impostor
      expect(JSON.stringify(delegate)).not.toContain("impostor");
    });

    it("a sub-agent resolves by id with its own tools, instructions and step budget", async () => {
      const model = mockModel([{ text: "ok" }]);
      const handler = createChatHandler({ model, agents: [shopper], maxSteps: 8 });
      await (await handler(post({ messages: [user], tools: toolsOnPage, agent: "checkout" }))).text();
      const call = model.doStreamCalls[0]!;
      expect((call.tools ?? []).map((t) => t.name)).toEqual(["get_cart", "checkout"]);
      expect(call.prompt.find((m) => m.role === "system")!.content).toContain("Review, apply, place.");
      expect(call.prompt.find((m) => m.role === "system")!.content).not.toContain("delegate_to_<agent>");
      // maxSteps 2: after two tool steps in the turn the model gets no tools (the handler's 8 would still allow tools)
      const step = (i: number): AgentMessage => ({
        id: `a${i}`,
        role: "assistant",
        parts: [
          { type: "tool", id: `c${i}`, name: "get_cart", input: {}, state: "done", output: { content: [{ type: "text", text: "ok" }] } },
        ],
      });
      await (await handler(post({ messages: [user, step(1), step(2)], tools: toolsOnPage, agent: "checkout" }))).text();
      expect(model.doStreamCalls[1]!.tools ?? []).toHaveLength(0);
    });

    it("refuses an unknown agent, or an agent that isn't a plain id", async () => {
      const handler = createChatHandler({ model: mockModel([{ text: "ok" }]), agents: [shopper] });
      const unknown = await handler(post({ messages: [user], tools: [], agent: "nope" }));
      expect(unknown.status).toBe(400);
      expect((await unknown.json()).message).toContain('Unknown agent "nope"');
      expect((await handler(post({ messages: [user], tools: [], agent: { id: "shopper", instructions: ["evil"] } }))).status).toBe(400);
      // no registry at all: naming an agent is still a 400, never a silent fallback
      expect(
        (await createChatHandler({ model: mockModel([{ text: "ok" }]) })(post({ messages: [user], tools: [], agent: "shopper" }))).status,
      ).toBe(400);
    });

    it("prepareAgent can tune the ToolLoopAgent the handler builds", async () => {
      const model = mockModel([{ text: "ok" }]);
      const seen: string[] = [];
      const handler = createChatHandler({
        model,
        agents: [shopper],
        prepareAgent: (settings, { agent }) => {
          seen.push(agent?.id ?? "none");
          return { ...settings, instructions: `${settings.instructions}\n\nAlways answer in French.` };
        },
      });
      await (await handler(post({ messages: [user], tools: [], agent: "shopper" }))).text();
      expect(seen).toEqual(["shopper"]);
      expect(model.doStreamCalls[0]!.prompt.find((m) => m.role === "system")!.content).toContain("Always answer in French.");
    });

    it("a per-agent model id is resolved with the provider's key", async () => {
      const createOpenAI = vi.fn(() => () => mockModel([{ text: "from openai" }]));
      vi.doMock("@ai-sdk/openai", () => ({ createOpenAI }));
      const fast = defineWebAgent({ id: "fast", instructions: "f", model: "openai/gpt-5.5-mini" });
      const handler = createChatHandler({
        env: { OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "a" },
        agents: [fast],
        model: mockModel([{ text: "default" }]),
      });
      const res = await handler(post({ messages: [user], tools: [], agent: "fast" }));
      expect(res.status).toBe(200);
      expect((await res.text()).replace(/\s/g, "")).toContain('"delta":"openai"');
      expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "k" });
      vi.doUnmock("@ai-sdk/openai");
      _resetModelCache();
    });
  });
});
