import { describe, expect, it, vi } from "vitest";
import { createCloudAdapter } from "../src/adapter/cloud";
import { defineWebAgent, type WebAgent } from "../src/agent";
import { createChatHandler } from "../src/server/handler";
import type { AgentMessage, AgentRunRequest, AgentStreamPart, ToolDescriptor } from "../src/types";
import { mockModel, type Step } from "@webmcp-agents/testing/server";

const user: AgentMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Add two mugs" }] };
const tools: ToolDescriptor[] = [
  { name: "add_to_cart", description: "Add", inputSchema: { type: "object", properties: { qty: { type: "number" } } } },
];

/** The adapter wired to the real handler, through an in-memory fetch. */
function setup(steps: Step[], opts: { maxSteps?: number; agents?: WebAgent[] } = {}) {
  const model = mockModel(steps);
  const handler = createChatHandler({ model, maxSteps: opts.maxSteps, agents: opts.agents });
  const bodies: { messages: AgentMessage[]; tools: ToolDescriptor[] }[] = [];
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") bodies.push(JSON.parse(String(init.body)));
    return handler(new Request(new URL(String(url), "http://x"), init));
  });
  const adapter = createCloudAdapter({ fetch, maxSteps: opts.maxSteps });
  return { adapter, fetch, bodies, model };
}

async function collect(adapter: ReturnType<typeof createCloudAdapter>, req: Partial<AgentRunRequest> = {}) {
  const all: AgentStreamPart[] = [];
  const callTool = vi.fn(async () => ({ content: [{ type: "text", text: "Added 2 × Mug." }] }));
  for await (const p of adapter.run({ messages: [user], tools, signal: new AbortController().signal, callTool, ...req })) all.push(p);
  // `parts` without the step markers (0.5.0): what 0.4.0's tests read; `all` with them
  const parts = all.filter((p) => p.type !== "step-start" && p.type !== "step-finish");
  return { parts, all, callTool };
}

describe("createCloudAdapter", () => {
  it("runs the model ↔ tool loop against the real handler", async () => {
    const { adapter, bodies } = setup([{ calls: [{ id: "c1", name: "add_to_cart", input: { qty: 2 } }] }, { text: "Done: 2 mugs." }]);
    const { parts, all, callTool } = await collect(adapter);
    // each step is framed by its markers, and ends (with its usage) before its tool calls run
    expect(all.map((p) => p.type)).toEqual([
      "step-start",
      "message-start",
      "tool-call",
      "step-finish",
      "tool-result",
      "step-start",
      "message-start",
      "text-delta",
      "text-delta",
      "text-delta",
      "step-finish",
      "finish",
    ]);
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "stop" });
    expect(callTool).toHaveBeenCalledWith({
      type: "tool-call",
      messageId: expect.any(String),
      id: "c1",
      name: "add_to_cart",
      input: { qty: 2 },
    });
    // the second request carries the tool's output
    const second = bodies[1]!.messages;
    expect(second).toHaveLength(2);
    expect(second[1]!.parts[0]).toMatchObject({ type: "tool", id: "c1", state: "done", output: { content: [{ text: "Added 2 × Mug." }] } });
  });

  it("reads the tools fresh for every step", async () => {
    const { adapter, bodies } = setup([{ calls: [{ id: "c1", name: "add_to_cart", input: { qty: 1 } }] }, { text: "ok" }]);
    let current = tools;
    const req: AgentRunRequest = {
      messages: [user],
      signal: new AbortController().signal,
      get tools() {
        return current;
      },
      callTool: async () => {
        current = []; // the tool hid itself
        return { content: [{ type: "text", text: "ok" }] };
      },
    };
    for await (const _ of adapter.run(req)); // a spread would read the getter once
    expect(bodies.map((b) => b.tools.length)).toEqual([1, 0]);
  });

  it("after maxSteps tool steps, one more request (with no tools) lets the model sum up", async () => {
    const steps = [1, 2].map((i) => ({ calls: [{ id: `c${i}`, name: "add_to_cart", input: { qty: i } }] }));
    const { adapter, bodies, model } = setup([...steps, { text: "Added 3 mugs in two steps." }], { maxSteps: 2 });
    const { parts, callTool } = await collect(adapter);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(bodies).toHaveLength(3);
    expect(model.doStreamCalls[2]!.tools ?? []).toHaveLength(0);
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "stop" });
  });

  it("records tool outputs truncated, so every request repeats the previous one's prefix", async () => {
    const { adapter, bodies } = setup([{ calls: [{ id: "c1", name: "add_to_cart", input: { qty: 1 } }] }, { text: "ok" }]);
    const long = "x".repeat(10_000);
    const { parts } = await collect(adapter, { callTool: async () => ({ content: [{ type: "text", text: long }] }) });
    const sent = JSON.stringify(bodies[1]!.messages);
    expect(sent).toContain("…(truncated)");
    expect(sent).not.toContain(long);
    expect(JSON.stringify(parts.find((p) => p.type === "tool-result"))).toContain("…(truncated)");
  });

  it("an abort during a tool call finishes as aborted, with no further request", async () => {
    const { adapter, fetch } = setup([{ calls: [{ id: "c1", name: "add_to_cart", input: { qty: 1 } }] }, { text: "never" }]);
    const ctrl = new AbortController();
    const { parts } = await collect(adapter, {
      signal: ctrl.signal,
      callTool: async () => {
        ctrl.abort();
        return { content: [{ type: "text", text: "Error [cancelled]: Cancelled by the user." }], isError: true };
      },
    });
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "aborted" });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("maps HTTP errors to codes", async () => {
    for (const [status, code] of [
      [429, "rate_limited"],
      [503, "chat_disabled"],
      [400, "bad_request"],
    ] as const) {
      const body = status === 503 ? '{"error":"chat_disabled"}' : "{}";
      const adapter = createCloudAdapter({ fetch: async () => new Response(body, { status }) });
      const { parts } = await collect(adapter);
      expect(parts).toEqual([expect.objectContaining({ type: "error", code })]);
    }
    const offline = createCloudAdapter({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect((await collect(offline)).parts).toEqual([expect.objectContaining({ type: "error", code: "network" })]);
  });

  it("a budget or a busy store is a passing error; only chat_disabled turns the chat off", async () => {
    const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      createCloudAdapter({ fetch: async () => new Response(JSON.stringify(body), { status, headers }) });
    const budget = respond(503, { error: "unavailable", reason: "daily_budget" });
    expect((await collect(budget)).parts[0]).toMatchObject({
      type: "error",
      code: "daily_limit",
      error: expect.stringMatching(/daily limit/),
    });
    expect(budget.status!()).toEqual({ state: "loading" });
    const busy = respond(503, { error: "unavailable", reason: "busy" });
    expect((await collect(busy)).parts[0]).toMatchObject({ code: "busy", error: expect.stringMatching(/busy/) });
    const off = respond(503, { error: "chat_disabled" });
    expect((await collect(off)).parts[0]).toMatchObject({ code: "chat_disabled" });
    expect(off.status!()).toMatchObject({ state: "unavailable" });
    const daily = respond(429, { error: "rate_limited" }, { "retry-after": "40000" });
    // 0.4.0 said "You've reached today's limit…" here: now one code, `daily_limit`, and its one text
    expect((await collect(daily)).parts[0]).toMatchObject({ code: "daily_limit", error: expect.stringMatching(/daily limit/) });
  });

  it("status comes from one GET", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ enabled: false }), { status: 200 }));
    const adapter = createCloudAdapter({ fetch });
    vi.stubGlobal("window", {});
    const changed = new Promise<void>((r) => adapter.subscribe!(r));
    expect(adapter.status!()).toEqual({ state: "loading" });
    await changed;
    expect(adapter.status!()).toMatchObject({ state: "unavailable" });
    adapter.status!();
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  describe("with a WebAgent", () => {
    const checkout = defineWebAgent({ id: "checkout", instructions: "c", maxSteps: 1 });
    const shopper = defineWebAgent({ id: "shopper", instructions: ["Sells mugs.", "Open first."], agents: [checkout] });

    it("sends only the agent's id, never its instructions, and drops nested runs from the history", async () => {
      const model = mockModel([{ text: "ok" }]);
      const handler = createChatHandler({ model, agents: [shopper] });
      const bodies: Record<string, unknown>[] = [];
      const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") bodies.push(JSON.parse(String(init.body)));
        return handler(new Request(new URL(String(url), "http://x"), init));
      });
      const adapter = createCloudAdapter({ fetch });
      const earlier: AgentMessage = {
        id: "a0",
        role: "assistant",
        parts: [
          {
            type: "tool",
            id: "d1",
            name: "delegate_to_checkout",
            input: { task: "x" },
            state: "done",
            output: { content: [{ type: "text", text: "Placed." }] },
            agent: { id: "checkout", messages: [{ id: "n1", role: "assistant", parts: [{ type: "text", text: "Placed." }] }] },
          },
        ],
      };
      await collect(adapter, { messages: [user, earlier, { ...user, id: "u2" }], agent: shopper });
      expect(bodies[0]!.agent).toBe("shopper");
      const text = JSON.stringify(bodies[0]);
      expect(text).not.toContain("Sells mugs");
      expect(text).not.toContain('"agent":{"id"');
      expect((bodies[0]!.messages as AgentMessage[])[1]!.parts[0]).toMatchObject({ name: "delegate_to_checkout", state: "done" });
    });

    it("the agent's maxSteps bounds the loop", async () => {
      const steps = [1, 2, 3].map((i) => ({ calls: [{ id: `c${i}`, name: "add_to_cart", input: { qty: i } }] }));
      const { adapter, bodies } = setup([...steps, { text: "done" }], { maxSteps: 8, agents: [checkout] });
      const { parts } = await collect(adapter, { agent: checkout });
      expect(bodies).toHaveLength(2); // 1 tool step (the agent's budget), then the summary request the server answers without tools
      expect(parts.at(-1)?.type).toBe("finish");
    });
  });

  it("labels itself with the endpoint's model once the check answers", async () => {
    const adapter = createCloudAdapter({
      fetch: vi.fn(async () => Response.json({ enabled: true, model: "openai/gpt-5.5", provider: "openai" })),
    });
    vi.stubGlobal("window", {});
    expect(adapter.label).toBe("Cloud");
    adapter.status!();
    await new Promise((r) => setTimeout(r, 0));
    expect(adapter.label).toBe("GPT-5.5 (cloud)");
    const claude = createCloudAdapter({
      fetch: vi.fn(async () => Response.json({ enabled: true, model: "anthropic/claude-opus-5-5", provider: "anthropic" })),
    });
    claude.status!();
    await new Promise((r) => setTimeout(r, 0));
    expect(claude.label).toBe("Claude (cloud)");
    expect(createCloudAdapter({ label: "Mine", id: "mine" })).toMatchObject({ id: "mine", label: "Mine" });
    vi.unstubAllGlobals();
  });
});
