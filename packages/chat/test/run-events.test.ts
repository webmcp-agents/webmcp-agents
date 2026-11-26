/**
 * Run events without a page (R-RUN-1, R-RUN-2): `onAgentRun` itself, the order of events through `runAgent` (the loop
 * behind the chat, `useWebAgent` and `agent.invoke`), and the ids the cloud adapter sends with each step. Tools need a
 * page, so here they answer with an error; parked, yielding and cancelled calls are in run-events.browser.test.tsx.
 * Failure paths first.
 */
import { expect, test } from "@webmcp-agents/testing";
import { fail, mockAdapter, mockChatServer, text, toolCall } from "@webmcp-agents/testing/chat";
import { afterEach, describe, vi } from "vitest";
import { createCloudAdapter } from "../src/adapter/cloud";
import { defineWebAgent } from "../src/agent";
import { en } from "../src/customize/en";
import { type AgentRunEvent, emitRun, newRunRef, onAgentRun, runId } from "../src/session/run-events";
import { runAgent } from "../src/session/run-agent";
import { validTraceparent } from "../src/shared";
import type { AgentAdapter, AgentMessage, AgentStreamPart } from "../src/types";

const say = (t: string): AgentMessage[] => [{ id: "u1", role: "user", parts: [{ type: "text", text: t }] }];
const run = (adapter: AgentAdapter, options: Partial<Parameters<typeof runAgent>[0]> = {}) =>
  runAgent({ adapter, messages: say("Add two mugs"), signal: new AbortController().signal, ...options });
/** An adapter that plays a fixed stream of parts. */
const streamOf = (parts: (AgentStreamPart | ((req: Parameters<AgentAdapter["run"]>[0]) => Promise<AgentStreamPart>))[]): AgentAdapter => ({
  id: "custom",
  label: "Custom",
  async *run(req) {
    for (const p of parts) yield typeof p === "function" ? await p(req) : p;
  },
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("onAgentRun: listeners never break a run", () => {
  test("a listener that throws: the run goes on, later listeners still get every event, and it is logged once", async ({ runs }) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const off = onAgentRun(() => {
      throw new Error("analytics down");
    });
    const after: string[] = [];
    const off2 = onAgentRun((e) => after.push(e.type));
    try {
      const result = await run(mockAdapter([text("Done.")]));
      expect(result.reason).toBe("stop");
      expect(after).toEqual(["run-start", "step-start", "step-finish", "run-finish"]);
      expect(runs.types()).toEqual(after);
      expect(errors.mock.calls.filter(([l]) => String(l).includes("onAgentRun listener threw"))).toHaveLength(1);
    } finally {
      off();
      off2();
    }
  });

  test("it takes a function", () => {
    expect(() => onAgentRun("nope" as never)).toThrow("onAgentRun(listener) needs a function");
  });

  test("unsubscribing: no further event reaches that listener", async () => {
    const seen: string[] = [];
    const off = onAgentRun((e) => {
      seen.push(e.type);
      if (e.type === "step-start") off();
    });
    await run(mockAdapter([text("Done.")]));
    expect(seen).toEqual(["run-start", "step-start"]);
  });

  test("redacted by default: a password's value reaches only a listener that asked for raw data", async ({ runs }) => {
    const raw: AgentRunEvent[] = [];
    const off = onAgentRun((e) => raw.push(e), { raw: true });
    try {
      await run(mockAdapter([toolCall("sign_in", { email: "a@b.co", password: "hunter2" }), text("Done.")]));
    } finally {
      off();
    }
    const start = (events: readonly AgentRunEvent[]) =>
      events.find((e) => e.type === "tool-start") as Extract<AgentRunEvent, { type: "tool-start" }>;
    expect(start(raw).input).toEqual({ email: "a@b.co", password: "hunter2" });
    expect(runs).not.toContainSensitive(["hunter2"]);
    expect(start(runs.events).input).toMatchObject({ password: expect.not.stringContaining("hunter2") });
  });

  test("events are frozen: a listener cannot change what the next one gets", () => {
    const ref = newRunRef("c1");
    const off = onAgentRun((e) => {
      (e as { at: number }).at = -1;
    });
    const seen: AgentRunEvent[] = [];
    const off2 = onAgentRun((e) => seen.push(e), { raw: true });
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      emitRun({ type: "run-start", ref, adapter: "x", at: 5 });
    } finally {
      off();
      off2();
    }
    expect(seen[0]).toMatchObject({ at: 5 });
  });
});

describe("ids", () => {
  test("run and conversation ids are UUIDs (unique across pages and tabs) without the kit's id source", () => {
    const a = runId("run");
    expect(a).toMatch(UUID);
    expect(runId("run")).not.toBe(a);
    expect(runId("conversation")).toMatch(UUID);
  });

  test("a run's trace context is a valid traceparent; a sub-agent's run shares the trace id with its own span", () => {
    const root = newRunRef("c1");
    expect(root.traceparent).toMatch(TRACEPARENT);
    expect(validTraceparent(root.traceparent)).toBe(root.traceparent);
    const sub = newRunRef("c1", { call: "call-7", of: root });
    expect(sub).toMatchObject({ conversation: "c1", parent: "call-7" });
    expect(sub.run).not.toBe(root.run);
    expect(sub.traceparent!.split("-")[1]).toBe(root.traceparent!.split("-")[1]);
    expect(sub.traceparent!.split("-")[2]).not.toBe(root.traceparent!.split("-")[2]);
  });

  test("not sampled until something records the run: -00, then -01 once claimed; a sub-agent's run starts with its parent's flag", () => {
    const root = newRunRef("c1");
    expect(root.sampled).toBe(false);
    expect(root.traceparent).toMatch(/-00$/);
    expect(newRunRef("c1", { call: "call-1", of: root }).traceparent).toMatch(/-00$/);
    root.sampled = true;
    expect(root.traceparent).toMatch(/-01$/);
    expect(validTraceparent(root.traceparent)).toBe(root.traceparent);
    const sub = newRunRef("c1", { call: "call-2", of: root });
    expect(sub.sampled).toBe(true);
    expect(sub.traceparent).toMatch(/-01$/);
    expect(sub.traceparent!.split("-")[1]).toBe(root.traceparent!.split("-")[1]);
  });

  test.each([
    undefined,
    null,
    "",
    "garbage",
    "00-0af7651916cd43dd8448eb211c80319c-b7ad6b716920333-01",
    "00-00000000000000000000000000000000-b7ad6b7169203331-01",
    "00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01",
    "ff-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
  ])("a malformed traceparent (%s) reads as none", (value) => {
    expect(validTraceparent(value)).toBeUndefined();
  });
});

describe("R-RUN-2: events in order", () => {
  test("a failure: run-finish says error with the code, and the catalog's text, never the adapter's message", async ({ runs }) => {
    await run(mockAdapter([fail("rate_limited", `slow down, ${"4242 4242 4242 4242"}`)]));
    expect(runs.types()).toEqual(["run-start", "step-start", "step-finish", "run-finish"]);
    expect(runs.events.at(-1)).toMatchObject({
      type: "run-finish",
      reason: "error",
      code: "rate_limited",
      error: en.errors.rate_limited,
      steps: 1,
    });
    expect(runs).not.toContainSensitive(["4242"]);
    expect(runs).toHaveFinishedWith("error", "rate_limited");
  });

  test("an adapter that throws: run-finish with run_failed", async ({ runs }) => {
    const broken: AgentAdapter = {
      id: "broken",
      label: "Broken",
      // biome-ignore lint/correctness/useYield: it fails before its first part
      async *run() {
        throw new Error("socket closed");
      },
    };
    await run(broken);
    expect(runs.events.at(-1)).toMatchObject({ type: "run-finish", reason: "error", code: "run_failed", steps: 0 });
  });

  test("a whole run: two steps with one tool call between them, all with the same reference", async ({ runs }) => {
    await run(mockAdapter([toolCall("add_to_cart", { qty: 2 }), text("Done.")]));
    expect(runs.types()).toEqual([
      "run-start",
      "step-start",
      "step-finish",
      "tool-start",
      "tool-finish",
      "step-start",
      "step-finish",
      "run-finish",
    ]);
    const refs = new Set(runs.events.map((e) => JSON.stringify(e.ref)));
    expect(refs.size).toBe(1);
    expect(runs.events[0]).toMatchObject({
      type: "run-start",
      adapter: "mock",
      ref: { conversation: expect.stringMatching(UUID), run: expect.stringMatching(UUID) },
    });
    expect(runs.events.filter((e) => e.type === "step-start").map((e) => (e as { step: number }).step)).toEqual([1, 2]);
    expect(runs.events[3]).toMatchObject({ type: "tool-start", step: 1, tool: "add_to_cart", input: { qty: 2 } });
    expect(runs.events[2]).toMatchObject({
      type: "step-finish",
      step: 1,
      toolCalls: 1,
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "mock/model",
    });
    expect(runs.events.at(-1)).toMatchObject({ type: "run-finish", reason: "stop", steps: 2 });
    expect(runs).toHaveCalledTools(["add_to_cart"]);
  });

  test("the step limit: run-finish says max-steps", async ({ runs }) => {
    const agent = defineWebAgent({ id: "shopper", instructions: "Shop.", maxSteps: 1 });
    await run(mockAdapter([toolCall("add_to_cart"), toolCall("add_to_cart")]), { agent });
    expect(runs.events.at(-1)).toMatchObject({ type: "run-finish", reason: "max-steps" });
    expect(runs.events[0]).toMatchObject({ type: "run-start", agent: "shopper" });
    expect(runs).toHaveFinishedWith("max-steps");
  });

  test("an on-device run (no usage): the same events, and step-finish carries timing only", async ({ runs }) => {
    await run(mockAdapter([toolCall("add_to_cart"), text("Done.")], { id: "local", usage: false }));
    expect(runs.types()).toEqual([
      "run-start",
      "step-start",
      "step-finish",
      "tool-start",
      "tool-finish",
      "step-start",
      "step-finish",
      "run-finish",
    ]);
    for (const e of runs.events.filter((x) => x.type === "step-finish")) {
      expect(e).not.toHaveProperty("usage");
      expect(e).not.toHaveProperty("model");
      expect((e as { ms: number }).ms).toBeGreaterThanOrEqual(0);
    }
  });

  test("an adapter without step markers (0.4.0-style): steps open at its first part and close at its first call", async ({ runs }) => {
    const adapter = streamOf([
      { type: "message-start", messageId: "a1" },
      { type: "tool-call", messageId: "a1", id: "c1", name: "add_to_cart", input: {} },
      { type: "tool-call", messageId: "a1", id: "c2", name: "add_to_cart", input: {} },
      async (req) => ({ type: "tool-result", id: "c1", output: await req.callTool({ id: "c1", name: "add_to_cart", input: {} }) }),
      async (req) => ({ type: "tool-result", id: "c2", output: await req.callTool({ id: "c2", name: "add_to_cart", input: {} }) }),
      { type: "step-finish", step: 1 }, // 0.4.0's place for it: after the calls (ignored, the step is closed)
      { type: "message-start", messageId: "a2" },
      { type: "text-delta", messageId: "a2", delta: "Done." },
      { type: "finish", reason: "stop" },
    ]);
    await run(adapter);
    expect(runs.types()).toEqual([
      "run-start",
      "step-start",
      "step-finish",
      "tool-start",
      "tool-finish",
      "tool-start",
      "tool-finish",
      "step-start",
      "step-finish",
      "run-finish",
    ]);
    expect(runs.events[2]).toMatchObject({ toolCalls: 2, firstTokenMs: expect.any(Number) });
  });

  test("nothing is emitted after run-finish, and each run has its own id", async ({ runs }) => {
    const adapter = mockAdapter([text("One."), text("Two.")]);
    await run(adapter, { conversation: "conv-1" });
    await run(adapter, { conversation: "conv-1" });
    const ids = runs.runIds();
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) {
      const own = runs.of(id);
      expect(own.at(-1)!.type).toBe("run-finish");
      expect(own.filter((e) => e.type === "run-finish")).toHaveLength(1);
      expect(own.every((e) => e.ref.conversation === "conv-1")).toBe(true);
    }
  });

  test("a sub-agent: its events carry parent = the delegate call, and sit between that call's tool-start and tool-finish", async ({
    runs,
  }) => {
    const helper = defineWebAgent({ id: "helper", instructions: "Find things." });
    const shopper = defineWebAgent({ id: "shopper", instructions: "Shop.", agents: [helper] });
    const adapter = mockAdapter([
      toolCall("delegate_to_helper", { task: "Find mugs." }, { id: "call-d" }),
      text("Found 3."),
      text("Done."),
    ]);
    await run(adapter, { agent: shopper });
    const types = runs.events.map((e) => `${e.ref.parent ? "sub:" : ""}${e.type}`);
    const from = types.indexOf("tool-start");
    const to = types.indexOf("tool-finish");
    expect(types.slice(from, to + 1)).toEqual([
      "tool-start",
      "sub:run-start",
      "sub:step-start",
      "sub:step-finish",
      "sub:run-finish",
      "tool-finish",
    ]);
    const sub = runs.events.filter((e) => e.ref.parent);
    const root = runs.events[0]!.ref;
    expect(sub.every((e) => e.ref.parent === "call-d" && e.ref.conversation === root.conversation && e.ref.run !== root.run)).toBe(true);
    expect(sub[0]).toMatchObject({ type: "run-start", agent: "helper" });
    expect(adapter.requests[1]!.ref).toMatchObject({ parent: "call-d", conversation: root.conversation });
    expect(runs).toHaveCalledTools(["delegate_to_helper"]);
  });
});

describe("R-RUN-1: the ids on every step request (the cloud adapter, the real handler)", () => {
  test("three steps share one conversation and one run, with step 1, 2, 3 and the run's traceparent", async ({ runs }) => {
    const server = mockChatServer({ steps: [toolCall("add_to_cart"), toolCall("add_to_cart"), text("Done.")] });
    const listTools = async () => [{ name: "add_to_cart", description: "Add", inputSchema: { type: "object" as const, properties: {} } }];
    await run(createCloudAdapter({ fetch: server.fetch }), { conversation: "conv-9", listTools });
    const posts = server.requests.filter((r) => r.method === "POST");
    expect(posts.map((r) => r.body?.trace)).toEqual([1, 2, 3].map((step) => ({ conversation: "conv-9", run: runs.runIds()[0], step })));
    const headers = posts.map((r) => r.headers.traceparent);
    expect(headers[0]).toMatch(TRACEPARENT);
    expect(new Set(headers).size).toBe(1);
    expect(headers[0]).toBe(runs.events[0]!.ref.traceparent);
    // nothing on the page records the run: the server must not wait for a parent span that never arrives
    expect(headers[0]).toMatch(/-00$/);
  });

  test("a run-start listener that claims the run: every step request (a sub-agent's too) carries the sampled flag", async ({ runs }) => {
    const helper = defineWebAgent({ id: "helper", instructions: "Help." });
    const lead = defineWebAgent({ id: "lead", instructions: "Lead.", agents: [helper] });
    const server = mockChatServer({
      steps: [toolCall("delegate_to_helper", { task: "Look." }), text("Seen."), text("Done.")],
      handler: { agents: [lead] },
    });
    const off = onAgentRun((e) => {
      if (e.type === "run-start" && !e.ref.parent) e.ref.sampled = true;
    });
    try {
      await run(createCloudAdapter({ fetch: server.fetch }), { agent: lead });
    } finally {
      off();
    }
    const posts = server.requests.filter((r) => r.method === "POST");
    const headers = posts.map((r) => r.headers.traceparent!);
    expect(headers).toHaveLength(3);
    for (const h of headers) expect(h).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(new Set(headers.map((h) => h.split("-")[1])).size).toBe(1);
    const starts = runs.events.filter((e) => e.type === "run-start");
    expect(starts).toHaveLength(2);
    expect(starts[1]!.ref.sampled).toBe(true);
    expect(headers[1]).toBe(starts[1]!.ref.traceparent);
  });

  test("a second turn of the same chat: the same conversation, a new run", async ({ runs }) => {
    const server = mockChatServer({ steps: [text("One.")] });
    const adapter = createCloudAdapter({ fetch: server.fetch });
    await run(adapter, { conversation: "conv-2" });
    await run(adapter, { conversation: "conv-2" });
    const traces = server.requests.filter((r) => r.method === "POST").map((r) => r.body?.trace as { conversation: string; run: string });
    expect(traces.map((t) => t.conversation)).toEqual(["conv-2", "conv-2"]);
    expect(traces[0]!.run).not.toBe(traces[1]!.run);
    expect(runs.runIds()).toEqual(traces.map((t) => t.run));
  });

  test("a sub-agent's requests carry parent and the same conversation", async () => {
    const helper = defineWebAgent({ id: "helper", instructions: "Find things." });
    const shopper = defineWebAgent({ id: "shopper", instructions: "Shop.", agents: [helper] });
    const server = mockChatServer({
      steps: [toolCall("delegate_to_helper", { task: "Find mugs." }, { id: "call-d" }), text("Found 3."), text("Done.")],
      handler: { agents: [shopper] },
    });
    await run(createCloudAdapter({ fetch: server.fetch }), { agent: shopper, conversation: "conv-3" });
    const traces = server.requests.filter((r) => r.method === "POST").map((r) => r.body?.trace as Record<string, unknown>);
    expect(traces[1]).toMatchObject({ conversation: "conv-3", parent: "call-d", step: 1 });
    expect(traces[0]).not.toHaveProperty("parent");
    expect(traces[2]).toMatchObject({ run: traces[0]!.run, step: 2 });
  });

  test("usage reaches step-finish with the model id", async ({ runs }) => {
    const server = mockChatServer({ steps: [text("Hi.", { usage: { inputTokens: 300, outputTokens: 12, reasoningTokens: 4 } })] });
    await run(createCloudAdapter({ fetch: server.fetch }));
    expect(runs.events.find((e) => e.type === "step-finish")).toMatchObject({
      usage: { inputTokens: 300, outputTokens: 12, reasoningTokens: 4, totalTokens: 312 },
      model: expect.any(String),
      firstTokenMs: expect.any(Number),
    });
  });

  test("usage kept on the server (usageToClient: false), or a server that sends none (0.4.0): step-finish with timing only", async ({
    runs,
  }) => {
    for (const telemetry of [{ usageToClient: false }, false]) {
      runs.clear();
      const server = mockChatServer({ steps: [text("Hi.")], handler: { telemetry } });
      await run(createCloudAdapter({ fetch: server.fetch }));
      const finish = runs.events.find((e) => e.type === "step-finish")!;
      expect(finish).not.toHaveProperty("usage");
      expect(finish).toMatchObject({ ms: expect.any(Number) });
    }
  });

  test("ids the server would refuse are never sent: the request goes untraced instead of failing", async () => {
    const server = mockChatServer({ steps: [text("Hi.")] });
    const result = await run(createCloudAdapter({ fetch: server.fetch }), { conversation: "not a valid id!" });
    expect(result.reason).toBe("stop");
    expect(server.requests.find((r) => r.method === "POST")!.body).not.toHaveProperty("trace");
  });
});
