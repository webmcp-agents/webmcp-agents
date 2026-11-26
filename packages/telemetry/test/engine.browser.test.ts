/**
 * The browser's span builder (design §7.5), fed scripted run events: the span tree, a sub-agent under its delegating
 * call, a confirmation's park / yield / resume, on-device steps, failures and aborts, recording and redaction, the
 * filter and the mapping, batching, and the golden list of names every span kind carries. Failure paths first.
 * (R-EXP-4, R-EXP-5, R-EXP-7)
 */
import type { AgentRunEvent, RunRef } from "@webmcp-agents/chat";
import { expect, test } from "@webmcp-agents/testing";
import { type MemoryExporter, memoryExporter, type RecordedSpan, spanTree } from "@webmcp-agents/testing/telemetry";
import { afterEach, describe, vi } from "vitest";
import { createEngine, type Engine } from "../src/browser/engine";
import type { ObserveAgentsOptions } from "../src/browser/types";
import * as semconv from "../src/semconv";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const RUN_SPAN = "00f067aa0ba902b7";
const REF: RunRef = { conversation: "conv-1", run: "run-1", traceparent: `00-${TRACE}-${RUN_SPAN}-01` };
const CARD = "4242 4242 4242 4242";

/** An engine exporting to memory at once (batch of 1), and a way to feed it. */
function engine(options: ObserveAgentsOptions = {}): { e: Engine; memory: MemoryExporter; spans: () => readonly RecordedSpan[] } {
  const memory = memoryExporter();
  const e = createEngine({ exporters: [memory], batchSize: 1, ...options })!;
  return { e, memory, spans: () => memory.spans };
}
/** Exporters given as `exporters` are resolved in a chunk of their own: wait for it. */
const settle = async (e: Engine) => {
  await e.flush();
  await e.flush();
};

/** A turn: two model steps on the cloud adapter, one tool call between them. */
function cloudTurn(ref = REF, adapter = "cloud", extra: AgentRunEvent[] = []): AgentRunEvent[] {
  return [
    { type: "run-start", ref, agent: "shopper", adapter, at: 10 },
    { type: "step-start", ref, step: 1, tools: 2, at: 11 },
    { type: "step-finish", ref, step: 1, ms: 40, toolCalls: 1, model: adapter === "cloud" ? "claude-sonnet-5-5" : undefined },
    { type: "tool-start", ref, step: 1, call: "call-1", tool: "add_to_cart", at: 52, input: { id: "mug-01", qty: 2 } },
    ...extra,
    {
      type: "tool-finish",
      ref,
      call: "call-1",
      tool: "add_to_cart",
      ms: 30,
      waitedMs: 0,
      state: "done",
      output: { content: [{ type: "text", text: "Added 2." }] },
    },
    { type: "step-start", ref, step: 2, tools: 2, at: 90 },
    { type: "step-finish", ref, step: 2, ms: 20, toolCalls: 0 },
    { type: "run-finish", ref, reason: "stop", ms: 120, steps: 2 },
  ];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("failures (R-EXP-4, R-EXP-7)", () => {
  test("no consent at the run's start: that run produces no span", async () => {
    const { e, spans } = engine();
    for (const ev of cloudTurn()) e.event(ev, ev.type === "run-start" ? false : undefined);
    await settle(e);
    expect(spans()).toEqual([]);
  });

  test("events of a run that was never started (observing began mid-run) are ignored", async () => {
    const { e, spans } = engine();
    for (const ev of cloudTurn().slice(1)) e.event(ev);
    await settle(e);
    expect(spans()).toEqual([]);
  });

  test("a sub-agent whose delegating call is not tracked is not observed on its own", async () => {
    const { e, spans } = engine();
    e.event({ type: "run-start", ref: { ...REF, run: "sub", parent: "call-x" }, agent: "helper", adapter: "cloud", at: 1 }, true);
    e.event({ type: "run-finish", ref: { ...REF, run: "sub", parent: "call-x" }, reason: "stop", ms: 5, steps: 1 });
    await settle(e);
    expect(spans()).toEqual([]);
  });

  test("an exporter that throws or rejects never breaks the next span", async () => {
    const memory = memoryExporter();
    const e = createEngine({
      exporters: [
        {
          export: () => {
            throw new Error("boom");
          },
        },
        { export: () => Promise.reject(new Error("no")) },
        memory,
      ],
      batchSize: 1,
    })!;
    for (const ev of cloudTurn()) e.event(ev, true);
    await settle(e);
    expect(memory.spans.length).toBe(2);
  });

  test("a spanFilter that throws drops that span", async () => {
    const { e, spans } = engine({
      spanFilter: () => {
        throw new Error("bad");
      },
    });
    for (const ev of cloudTurn()) e.event(ev, true);
    await settle(e);
    expect(spans()).toEqual([]);
  });

  test("a failed run and a failed call: status error with error.type; an abort ends what is open", async () => {
    const { e, spans } = engine();
    const ref = REF;
    e.event({ type: "run-start", ref, adapter: "cloud", at: 0 }, true);
    e.event({ type: "tool-start", ref, step: 1, call: "c1", tool: "pay", at: 1 });
    e.event({ type: "tool-finish", ref, call: "c1", tool: "pay", ms: 3, waitedMs: 0, state: "error", code: "not_found" });
    e.event({ type: "run-finish", ref, reason: "error", ms: 9, steps: 1, code: "rate_limited", error: "Too many requests." });
    await settle(e);
    expect(spans()).toHaveSpan("execute_tool pay", {
      "webmcp.tool.state": "error",
      "webmcp.tool.error.code": "not_found",
      "error.type": "not_found",
    });
    expect(spans()).toHaveSpan("invoke_agent web-agent", { "webmcp.run.reason": "error", "error.type": "rate_limited" });
    expect(spans().map((s) => s.status)).toEqual(["error", "error"]);
  });

  test('tracerProvider: "global" with none registered: no engine, one error', () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(createEngine({ tracerProvider: "global" })).toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"global" was set but the page registered no tracer provider'));
  });

  test("a browser OTLP target that cannot be used is off, with one error each", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = createEngine({
      exporters: [
        { endpoint: "https://a.example", endpoints: { traces: "https://b" } } as never,
        { endpoint: "https://c.example", protocol: "grpc" },
        {},
      ],
    })!;
    await settle(e);
    const lines = error.mock.calls.map(([m]) => String(m));
    expect(lines.some((m) => m.includes("both `endpoint` and `endpoints`"))).toBe(true);
    expect(lines.some((m) => m.includes('"http/json" only, not "grpc"'))).toBe(true);
    expect(lines.some((m) => m.includes("needs `endpoint` or `endpoints`"))).toBe(true);
  });
});

describe("the span tree (design §7.5; R-EXP-4)", () => {
  test("a cloud turn: invoke_agent with the run's ids, an execute_tool child; the steps are the server's", async () => {
    const { e, spans } = engine();
    for (const ev of cloudTurn()) e.event(ev, true);
    await settle(e);
    const [run] = spanTree(spans());
    expect(run!.span).toMatchObject({ name: "invoke_agent shopper", traceId: TRACE, spanId: RUN_SPAN });
    expect(run!.span.parentSpanId).toBeUndefined();
    expect(run!.children.map((c) => c.span.name)).toEqual(["execute_tool add_to_cart"]);
    expect(spans()).toBeOneTrace();
    expect(spans()).toHaveSpan("invoke_agent shopper", {
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.agent.id": "shopper",
      "webmcp.conversation.id": "conv-1",
      "webmcp.run.id": "run-1",
      "webmcp.adapter": "cloud",
      "webmcp.run.reason": "stop",
      "webmcp.run.steps": 2,
      "webmcp.page": expect.stringMatching(/^http/),
    });
    expect(spans()).toHaveSpan("execute_tool add_to_cart", {
      "gen_ai.tool.call.id": "call-1",
      "webmcp.step": 1,
      "webmcp.tool.state": "done",
    });
    const tool = spans().find((s) => s.name.startsWith("execute_tool"))!;
    expect(tool.endTime - tool.startTime).toBeCloseTo(30, 0);
  });

  test("an on-device run: each step is a browser chat span with no usage", async () => {
    const { e, spans } = engine();
    for (const ev of cloudTurn(REF, "local")) e.event(ev, true);
    await settle(e);
    const [run] = spanTree(spans());
    expect(run!.children.map((c) => c.span.name)).toEqual(["chat", "execute_tool add_to_cart", "chat"]);
    expect(spans()).toHaveSpan("chat", { "gen_ai.operation.name": "chat", "webmcp.step": 2 });
    expect(
      spans()
        .flatMap((s) => Object.keys(s.attributes))
        .filter((k) => k.startsWith("gen_ai.usage")),
    ).toEqual([]);
  });

  test("a sub-agent: its invoke_agent is a child of the delegating execute_tool, in the same trace", async () => {
    const { e, spans } = engine();
    const sub: RunRef = { conversation: "conv-1", run: "run-2", parent: "call-d", traceparent: `00-${TRACE}-1234567890abcdef-01` };
    const events: AgentRunEvent[] = [
      { type: "run-start", ref: REF, agent: "shopper", adapter: "cloud", at: 0 },
      { type: "tool-start", ref: REF, step: 1, call: "call-d", tool: "delegate_to_helper", at: 1 },
      { type: "run-start", ref: sub, agent: "helper", adapter: "cloud", at: 2 },
      { type: "run-finish", ref: sub, reason: "stop", ms: 5, steps: 1 },
      { type: "tool-finish", ref: REF, call: "call-d", tool: "delegate_to_helper", ms: 8, waitedMs: 0, state: "done" },
      { type: "run-finish", ref: REF, reason: "stop", ms: 10, steps: 2 },
    ];
    for (const ev of events) e.event(ev, ev.type === "run-start" && !ev.ref.parent ? true : undefined);
    await settle(e);
    const [run] = spanTree(spans());
    const call = run!.children[0]!;
    expect(call.span.name).toBe("execute_tool delegate_to_helper");
    expect(call.children.map((c) => c.span.name)).toEqual(["invoke_agent helper"]);
    expect(call.children[0]!.span).toMatchObject({ spanId: "1234567890abcdef", traceId: TRACE });
    expect(spans()).toHaveSpan("invoke_agent helper", { "webmcp.parent.call.id": "call-d", "webmcp.run.id": "run-2" });
    expect(spans()).toBeOneTrace();
  });

  test("a confirmation: the outcome, the waited time, and park / yield / resume events", async () => {
    const { e, spans } = engine();
    const wait: AgentRunEvent[] = [
      { type: "tool-park", ref: REF, call: "call-1", tool: "add_to_cart", prompt: "Click Add to cart to confirm.", at: 55 },
      { type: "tool-yield", ref: REF, call: "call-1", reason: "pointer", at: 60 },
    ];
    const events = cloudTurn(REF, "cloud", wait).map((ev) => (ev.type === "tool-finish" ? { ...ev, waitedMs: 1234.4 } : ev));
    for (const ev of events.slice(0, 6)) e.event(ev, true);
    e.resume();
    for (const ev of events.slice(6)) e.event(ev);
    await settle(e);
    expect(spans()).toHaveSpan("execute_tool add_to_cart", { "webmcp.tool.confirm": "accepted", "webmcp.tool.waited_ms": 1234 });
    const tool = spans().find((s) => s.name.startsWith("execute_tool"))!;
    expect(tool.events.map((ev) => ev.name)).toEqual(["webmcp.park", "webmcp.yield", "webmcp.resume"]);
    expect(tool.events[1]!.attributes).toEqual({ reason: "pointer" });
  });

  test.each([
    ["cancelled", { state: "cancelled" as const, code: "cancelled" }, "cancelled"],
    ["timed out (needs_user)", { state: "error" as const, code: "needs_user" }, "timeout"],
  ])("a confirmation that was %s", async (_, end, outcome) => {
    const { e, spans } = engine();
    e.event({ type: "run-start", ref: REF, adapter: "cloud", at: 0 }, true);
    e.event({ type: "tool-start", ref: REF, step: 1, call: "c", tool: "pay", at: 1 });
    e.event({ type: "tool-park", ref: REF, call: "c", tool: "pay", prompt: "Pay", at: 2 });
    e.event({ type: "tool-finish", ref: REF, call: "c", tool: "pay", ms: 9, waitedMs: 7, ...end });
    e.event({ type: "run-finish", ref: REF, reason: "stop", ms: 10, steps: 1 });
    await settle(e);
    expect(spans()).toHaveSpan("execute_tool pay", { "webmcp.tool.confirm": outcome });
  });

  test("a call that never parked has no confirmation attribute", async () => {
    const { e, spans } = engine();
    for (const ev of cloudTurn()) e.event(ev, true);
    await settle(e);
    expect(spans().find((s) => s.name.startsWith("execute_tool"))!.attributes).not.toHaveProperty("webmcp.tool.confirm");
  });

  test("a usage-reporting adapter's step: model and tokens on the browser chat span", async () => {
    const { e, spans } = engine();
    const ref = REF;
    e.event({ type: "run-start", ref, adapter: "mock", at: 0 }, true);
    e.event({ type: "step-start", ref, step: 1, tools: 0, at: 1 });
    e.event({ type: "step-finish", ref, step: 1, ms: 4, toolCalls: 0, model: "tiny", usage: { inputTokens: 10, outputTokens: 5 } });
    e.event({ type: "run-finish", ref, reason: "stop", ms: 6, steps: 1 });
    await settle(e);
    expect(spans()).toHaveSpan("chat tiny", {
      "gen_ai.request.model": "tiny",
      "gen_ai.usage.input_tokens": 10,
      "gen_ai.usage.output_tokens": 5,
    });
  });
});

describe("content only on opt-in, always redacted (R-EXP-5)", () => {
  const withCard = (): AgentRunEvent[] =>
    cloudTurn().map((ev) =>
      ev.type === "tool-start"
        ? { ...ev, input: { card: CARD, note: "for sara@example.com" } }
        : ev.type === "tool-finish"
          ? { ...ev, output: { content: [{ type: "text", text: `Charged ${CARD}` }] } }
          : ev,
    );

  test("defaults: no tool input or result on any span", async () => {
    const { e, memory } = engine();
    for (const ev of withCard()) e.event(ev, true);
    await settle(e);
    expect(memory).not.toContainSensitive(["4242", "sara@example.com", "Charged"]);
    expect(memory.spans.flatMap((s) => Object.keys(s.attributes))).not.toContain("gen_ai.tool.call.arguments");
  });

  test("recordInputs / recordOutputs: arguments and result exported, redacted", async () => {
    const { e, memory, spans } = engine({ recordInputs: true, recordOutputs: true });
    for (const ev of withCard()) e.event(ev, true);
    await settle(e);
    const tool = spans().find((s) => s.name.startsWith("execute_tool"))!;
    expect(tool.attributes["gen_ai.tool.call.arguments"]).toEqual(expect.stringContaining("note"));
    expect(tool.attributes["gen_ai.tool.call.result"]).toEqual(expect.stringContaining("Charged"));
    expect(memory).not.toContainSensitive(["4242", "sara@example.com"]);
  });

  test("the page URL is exported redacted: no query value, no hash, no credentials", async () => {
    const original = location.href;
    history.replaceState(null, "", "/reset?token=canary-token&email=sara@example.com#frag");
    try {
      const { e, spans } = engine();
      for (const ev of cloudTurn()) e.event(ev, true);
      await settle(e);
      const page = String(spans().find((s) => s.name.startsWith("invoke_agent"))!.attributes["webmcp.page"]);
      expect(page).toMatch(/\/reset\?token=\[REDACTED\]&email=\[REDACTED\]$/);
    } finally {
      history.replaceState(null, "", original);
    }
  });

  test("a spanFilter that returns false: that span is not exported", async () => {
    const { e, spans } = engine({ spanFilter: (s) => !s.name.startsWith("execute_tool") });
    for (const ev of cloudTurn()) e.event(ev, true);
    await settle(e);
    expect(spans().map((s) => s.name)).toEqual(["invoke_agent shopper"]);
  });

  test("metadataMapping copies an id to a backend's grouping key, before redaction (session.id is kept)", async () => {
    const { e, spans } = engine({ metadataMapping: { "webmcp.conversation.id": "session.id" } });
    for (const ev of cloudTurn()) e.event(ev, true);
    await settle(e);
    expect(spans()).toHaveSpan("invoke_agent shopper", { "webmcp.conversation.id": "conv-1", "session.id": "conv-1" });
  });

  test("redact: false exports as is (local debugging only)", async () => {
    const { e, spans } = engine({ recordInputs: true, redact: false });
    for (const ev of withCard()) e.event(ev, true);
    await settle(e);
    expect(JSON.stringify(spans())).toContain("4242");
  });
});

describe("sampling and batching", () => {
  test("sampling never: no span; a custom sampler sees the agent and conversation", async () => {
    const asked: unknown[] = [];
    const never = engine({ sampling: { type: "never" } });
    for (const ev of cloudTurn()) never.e.event(ev, true);
    const custom = engine({
      sampling: {
        type: "custom",
        sampler: (ctx) => {
          asked.push(ctx);
          return false;
        },
      },
    });
    for (const ev of cloudTurn()) custom.e.event(ev, true);
    await settle(never.e);
    await settle(custom.e);
    expect([...never.spans(), ...custom.spans()]).toEqual([]);
    expect(asked).toEqual([{ agent: "shopper", conversation: "conv-1" }]);
  });

  test("a recorded run is claimed (ref.sampled, so its step requests say -01); one without consent or sampled out is not", async () => {
    const fresh = (): RunRef => ({ conversation: "conv-1", run: "run-1", traceparent: `00-${TRACE}-${RUN_SPAN}-00` });
    const claimed: (boolean | undefined)[] = [];
    for (const [options, consent, kept] of [
      [{}, true, undefined],
      [{}, false, undefined],
      [{ sampling: { type: "never" } }, true, undefined],
      // the caller (observeAgents) already sampled: the engine follows its decision, never samples twice
      [{ sampling: { type: "never" } }, true, true],
      [{}, true, false],
    ] as const) {
      const ref = fresh();
      const { e } = engine(options as ObserveAgentsOptions);
      e.event({ type: "run-start", ref, agent: "shopper", adapter: "cloud", at: 1 }, consent, kept);
      claimed.push(ref.sampled);
    }
    expect(claimed).toEqual([true, undefined, undefined, true, undefined]);
  });

  /** An engine whose exporter records each batch as its span names, in order. */
  async function batching(options: ObserveAgentsOptions = {}) {
    const batches: string[][] = [];
    const e = createEngine({ exporters: [{ export: (s) => void batches.push(s.map((x) => x.name)) }], ...options })!;
    await e.flush(); // the exporters chunk is loaded
    return { e, batches };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const callEvents = (ref: RunRef, call: string, at: number): AgentRunEvent[] => [
    { type: "tool-start", ref, step: 1, call, tool: "search", at },
    { type: "tool-finish", ref, call, tool: "search", ms: 1, waitedMs: 0, state: "done" },
  ];

  test("a run's spans are held until the run ends, then sent in one batch, parents first (a sub-agent's run included)", async () => {
    const { e, batches } = await batching();
    vi.useFakeTimers();
    const sub: RunRef = { ...REF, run: "sub", parent: "call-1", traceparent: undefined };
    const delegated: AgentRunEvent[] = [
      { type: "run-start", ref: sub, agent: "helper", adapter: "cloud", at: 53 },
      ...callEvents(sub, "call-2", 54),
      { type: "run-finish", ref: sub, reason: "stop", ms: 5, steps: 1 },
    ];
    const events = cloudTurn(REF, "cloud", delegated);
    for (const ev of events.slice(0, -1)) e.event(ev, true);
    // the batch timer and the batch size do not send a run's spans early
    await vi.advanceTimersByTimeAsync(10_000);
    expect(batches).toEqual([]);
    e.event(events.at(-1)!, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(batches).toEqual([["invoke_agent shopper", "execute_tool add_to_cart", "invoke_agent helper", "execute_tool search"]]);
  });

  test(`past ${128} spans a run sends what it holds early, in the same order; the rest goes when it ends`, async () => {
    const { e, batches } = await batching();
    e.event({ type: "run-start", ref: REF, agent: "shopper", adapter: "cloud", at: 1 }, true);
    for (let i = 0; i < 130; i++) for (const ev of callEvents(REF, `c${i}`, 2 + i)) e.event(ev, true);
    await tick();
    expect(batches.map((b) => b.length)).toEqual([128]);
    e.event({ type: "run-finish", ref: REF, reason: "stop", ms: 500, steps: 1 }, true);
    await e.flush();
    expect(batches.map((b) => b.length)).toEqual([128, 3]);
    expect(batches[1]![0]).toBe("invoke_agent shopper");
  });

  test("a run that goes on for 5 minutes sends what it holds then; a span that ends after its run is not held again", async () => {
    const { e, batches } = await batching();
    vi.useFakeTimers();
    e.event({ type: "run-start", ref: REF, agent: "shopper", adapter: "cloud", at: 1 }, true);
    for (const ev of callEvents(REF, "c1", 2)) e.event(ev, true);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(batches).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(batches).toEqual([["execute_tool search"]]);
    // a sub-agent's run that outlives its root goes on the ordinary batch (2 s), not held again
    const sub: RunRef = { ...REF, run: "sub", parent: "late", traceparent: undefined };
    e.event({ type: "tool-start", ref: REF, step: 1, call: "late", tool: "delegate_to_helper", at: 3 }, true);
    e.event({ type: "run-start", ref: sub, agent: "helper", adapter: "cloud", at: 4 });
    e.event({ type: "run-finish", ref: REF, reason: "stop", ms: 10, steps: 1 }, true);
    e.event({ type: "run-finish", ref: sub, reason: "stop", ms: 20, steps: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(batches).toEqual([["execute_tool search"], ["invoke_agent shopper"]]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(batches.at(-1)).toEqual(["invoke_agent helper"]);
  });

  test("flush (the page hidden) sends a running run's spans now; a run the filter drops still releases its calls", async () => {
    const { e, batches } = await batching({ spanFilter: (s) => !s.name.startsWith("invoke_agent") });
    e.event({ type: "run-start", ref: REF, agent: "shopper", adapter: "cloud", at: 1 }, true);
    for (const ev of callEvents(REF, "c1", 2)) e.event(ev, true);
    await e.flush();
    expect(batches).toEqual([["execute_tool search"]]);
    for (const ev of callEvents(REF, "c2", 3)) e.event(ev, true);
    e.event({ type: "run-finish", ref: REF, reason: "stop", ms: 10, steps: 1 }, true);
    await tick();
    expect(batches).toEqual([["execute_tool search"], ["execute_tool search"]]);
  });
});

describe("the golden list of span names and attribute keys, per span kind (semconv snapshot)", () => {
  test("every name is a constant in semconv.ts, and each kind carries exactly these keys", async () => {
    const { e, spans } = engine({ recordInputs: true, recordOutputs: true });
    const failing: AgentRunEvent[] = [
      { type: "tool-park", ref: REF, call: "call-1", tool: "add_to_cart", prompt: "Confirm", at: 55 },
      { type: "tool-yield", ref: REF, call: "call-1", reason: "pointer", at: 56 },
    ];
    const events = cloudTurn({ ...REF, parent: undefined }, "local", failing).map((ev) =>
      ev.type === "tool-finish"
        ? { ...ev, state: "error" as const, code: "needs_user" }
        : ev.type === "run-finish"
          ? { ...ev, reason: "error" as const, code: "rate_limited" }
          : ev.type === "step-finish"
            ? { ...ev, model: "tiny", usage: { inputTokens: 1, outputTokens: 1 } }
            : ev,
    );
    for (const ev of events) e.event(ev, true);
    e.event({
      type: "run-start",
      ref: { ...REF, run: "sub", parent: "call-1", traceparent: undefined },
      agent: "helper",
      adapter: "cloud",
      at: 1,
    });
    await settle(e);
    const byKind: Record<string, string[]> = {};
    for (const s of spans()) byKind[String(s.attributes["gen_ai.operation.name"])] = Object.keys(s.attributes).sort();
    expect(byKind).toEqual({
      invoke_agent: [
        "error.type",
        "gen_ai.agent.id",
        "gen_ai.operation.name",
        "webmcp.adapter",
        "webmcp.conversation.id",
        "webmcp.page",
        "webmcp.run.id",
        "webmcp.run.reason",
        "webmcp.run.steps",
      ],
      execute_tool: [
        "error.type",
        "gen_ai.operation.name",
        "gen_ai.tool.call.arguments",
        "gen_ai.tool.call.id",
        "gen_ai.tool.call.result",
        "gen_ai.tool.name",
        "webmcp.conversation.id",
        "webmcp.run.id",
        "webmcp.step",
        "webmcp.tool.confirm",
        "webmcp.tool.error.code",
        "webmcp.tool.state",
        "webmcp.tool.waited_ms",
      ],
      chat: [
        "gen_ai.operation.name",
        "gen_ai.request.model",
        "gen_ai.usage.input_tokens",
        "gen_ai.usage.output_tokens",
        "webmcp.conversation.id",
        "webmcp.run.id",
        "webmcp.step",
      ],
    });
    // the span names and every key and event above are semconv constants
    const constants = new Set<string>(Object.values(semconv));
    const keys = Object.values(byKind).flat();
    expect(keys.filter((k) => !constants.has(k))).toEqual([]);
    expect([...new Set(spans().map((s) => s.name.split(" ")[0]))].every((op) => constants.has(op!))).toBe(true);
    expect(
      spans()
        .flatMap((s) => s.events.map((ev) => ev.name))
        .every((n) => constants.has(n)),
    ).toBe(true);
  });

  test("the semconv module itself (names other packages and recipes depend on)", () => {
    expect(Object.entries(semconv).sort(([a], [b]) => a.localeCompare(b))).toMatchSnapshot();
  });
});
