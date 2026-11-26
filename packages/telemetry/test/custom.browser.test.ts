/**
 * The app's own events and spans in a run's trace (`recordAgentEvent`, `withAgentSpan`), on a real page with real
 * runs: attached to the right run (or tool call), through the same pipeline as the package's spans (redaction,
 * spanFilter, the relay), and a cheap no-op whenever the run is not recorded. Its own file: the first test needs a page
 * where the span builder has not loaded yet.
 */
import { type AgentRunEvent, defineWebAgent, onAgentRun } from "@webmcp-agents/chat";
import { defineWebTool, registerWebTool } from "@webmcp-agents/core";
import { expect, modelContext, test, uniqueName } from "@webmcp-agents/testing";
import { mockAdapter, text, toolCall } from "@webmcp-agents/testing/chat";
import { memoryExporter, type RecordedSpan } from "@webmcp-agents/testing/telemetry";
import { afterEach, beforeAll, describe, vi } from "vitest";
import { observeAgents, recordAgentEvent, withAgentSpan } from "../src";
import { defineObservability } from "../src/server";

const CARD = "4242 4242 4242 4242";
const loaded = (part: string): boolean => performance.getEntriesByType("resource").some((e) => e.name.includes(part));
const agent = defineWebAgent({ id: "shopper", instructions: "Shop." });
const hi = () => agent.invoke("Hi.", { adapter: mockAdapter([text("Hello.")]) });
const runSpan = (spans: readonly RecordedSpan[]) => spans.find((s) => s.name === "invoke_agent shopper")!;

/** A tool whose `execute` is `body`, registered, with an agent that calls it once. */
function withTool(body: () => unknown) {
  const tool = defineWebTool({
    id: uniqueName("checkout"),
    description: "Check out.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      await body();
      return "Done.";
    },
  });
  const off = registerWebTool(tool);
  const shopper = defineWebAgent({ id: "shopper", instructions: "Shop.", tools: [tool] });
  const run = () => shopper.invoke("Check out.", { adapter: mockAdapter([toolCall(tool.id, {}), text("Done.")]) });
  return { tool, off, run };
}

/** Call `fn` at the first event of `type` (synchronously, from inside the run). */
function at(type: AgentRunEvent["type"], fn: (e: AgentRunEvent) => void): () => void {
  let done = false;
  return onAgentRun((e) => {
    if (done || e.type !== type) return;
    done = true;
    fn(e);
  });
}

beforeAll(() => modelContext());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("queued while the span builder loads", () => {
  test("an event recorded at the run's start, before the engine chunk is there, lands on the run span", async () => {
    const memory = memoryExporter();
    const stop = observeAgents({ exporters: [memory] });
    let early: boolean | undefined;
    const off = at("run-start", () => {
      early = !loaded("browser/engine");
      recordAgentEvent("cart.opened", { "cart.items": 2 });
    });
    try {
      await hi();
      await stop.flush();
      expect(early).toBe(true);
      expect(runSpan(memory.spans).events).toEqual([{ name: "cart.opened", attributes: { "cart.items": 2 } }]);
    } finally {
      off();
      stop();
    }
  });
});

describe("recordAgentEvent", () => {
  test("an event on the running run's span, its values redacted (a card number masked), webmcp.* keys dropped", async () => {
    const memory = memoryExporter();
    const stop = observeAgents({ exporters: [memory] });
    const { off, run } = withTool(() =>
      recordAgentEvent("payment.entered", { "payment.card": CARD, "payment.note": `card ${CARD}`, "webmcp.run.id": "forged" }),
    );
    try {
      await run();
      await stop.flush();
      const [event] = runSpan(memory.spans).events;
      expect(event!.name).toBe("payment.entered");
      expect(Object.keys(event!.attributes!).sort()).toEqual(["payment.card", "payment.note"]);
      expect(memory).not.toContainSensitive(["4242", "forged"]);
    } finally {
      off();
      stop();
    }
  });

  test("options.run targets a run by id; an id that is not recorded drops the event", async () => {
    const memory = memoryExporter();
    const stop = observeAgents({ exporters: [memory] });
    const off = at("step-start", (e) => {
      recordAgentEvent("by.ref", {}, { run: e.ref });
      recordAgentEvent("by.id", {}, { run: e.ref.run });
      recordAgentEvent("unknown", {}, { run: "no-such-run" });
    });
    try {
      await hi();
      await stop.flush();
      expect(runSpan(memory.spans).events.map((e) => e.name)).toEqual(["by.ref", "by.id"]);
    } finally {
      off();
      stop();
    }
  });
});

describe("withAgentSpan", () => {
  test("inside a tool call: a child of that execute_tool span, timed around fn, returns its value", async () => {
    const memory = memoryExporter();
    const stop = observeAgents({ exporters: [memory] });
    let value: unknown;
    const { tool, off, run } = withTool(async () => {
      value = await withAgentSpan("inventory.lookup", () => new Promise((r) => setTimeout(() => r(7), 30)), { "inventory.sku": "mug-01" });
    });
    try {
      await run();
      await stop.flush();
      expect(value).toBe(7);
      const call = memory.spans.find((s) => s.name === `execute_tool ${tool.id}`)!;
      const custom = memory.spans.find((s) => s.name === "inventory.lookup")!;
      expect(custom.parentSpanId).toBe(call.spanId);
      expect(custom.traceId).toBe(call.traceId);
      expect(custom.endTime - custom.startTime).toBeGreaterThanOrEqual(25);
      expect(custom.status).toBe("unset");
      expect(custom.attributes).toMatchObject({
        "inventory.sku": "mug-01",
        "webmcp.custom": true,
        "webmcp.run.id": runSpan(memory.spans).attributes["webmcp.run.id"],
        "gen_ai.tool.call.id": call.attributes["gen_ai.tool.call.id"],
      });
    } finally {
      off();
      stop();
    }
  });

  test("with no tool call running: a child of the run span; a sync fn's value is returned as is", async () => {
    const memory = memoryExporter();
    const stop = observeAgents({ exporters: [memory] });
    let value: unknown;
    const off = at("step-start", () => {
      value = withAgentSpan("prompt.build", () => "built");
    });
    try {
      await hi();
      await stop.flush();
      expect(value).toBe("built");
      expect(memory.spans.find((s) => s.name === "prompt.build")!.parentSpanId).toBe(runSpan(memory.spans).spanId);
    } finally {
      off();
      stop();
    }
  });

  test("a throw or a rejection: error status with error.type, the error passed on unchanged, the message redacted", async () => {
    const memory = memoryExporter();
    const stop = observeAgents({ exporters: [memory] });
    const thrown = new TypeError(`bad card ${CARD}`);
    let caught: unknown[] = [];
    const { off, run } = withTool(async () => {
      try {
        withAgentSpan("sync.fail", () => {
          throw thrown;
        });
      } catch (err) {
        caught.push(err);
      }
      await withAgentSpan("async.fail", () => Promise.reject(thrown)).catch((err: unknown) => caught.push(err));
    });
    try {
      await run();
      await stop.flush();
      expect(caught).toEqual([thrown, thrown]);
      for (const name of ["sync.fail", "async.fail"])
        expect(memory.spans.find((s) => s.name === name)).toMatchObject({ status: "error", attributes: { "error.type": "TypeError" } });
      expect(memory).not.toContainSensitive(["4242"]);
    } finally {
      caught = [];
      off();
      stop();
    }
  });

  test("a spanFilter sees the custom span (webmcp.custom) and can drop it", async () => {
    const memory = memoryExporter();
    const stop = observeAgents({ exporters: [memory], spanFilter: (s) => s.attributes["webmcp.custom"] !== true });
    const off = at("step-start", () => withAgentSpan("dropped", () => 1));
    try {
      await hi();
      await stop.flush();
      expect(memory.spans.map((s) => s.name)).toEqual(expect.arrayContaining(["invoke_agent shopper"]));
      expect(memory.spans.map((s) => s.name)).not.toContain("dropped");
    } finally {
      off();
      stop();
    }
  });
});

describe("a no-op when the run is not recorded", () => {
  test("no observer, no consent, not sampled, or between runs: fn runs, its value comes back, nothing is exported", async () => {
    const memory = memoryExporter();
    const record = () => {
      recordAgentEvent("e", { a: 1 });
      return withAgentSpan("s", () => 42);
    };
    // no observer at all
    let value: unknown;
    let off = at("step-start", () => (value = record()));
    await hi();
    off();
    expect(value).toBe(42);
    for (const options of [{ enabled: () => false }, { sampling: { type: "never" as const } }]) {
      const stop = observeAgents({ exporters: [memory], ...options });
      value = undefined;
      off = at("step-start", () => (value = record()));
      await hi();
      off();
      await stop.flush();
      stop();
      expect(value).toBe(42);
    }
    // observing, between runs
    const stop = observeAgents({ exporters: [memory] });
    await hi();
    await stop.flush();
    memory.reset();
    expect(record()).toBe(42);
    await stop.flush();
    stop();
    expect(memory.spans).toEqual([]);
  });
});

describe("through the relay", () => {
  test("the relay accepts a custom span (this package's scope) and forwards it with the run", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit = {}) => {
      posts.push(String(init.body));
      return new Response(null, { status: 202 });
    });
    const stop = observeAgents();
    const off = at("step-start", () => {
      withAgentSpan("prompt.build", () => "built", { "prompt.note": `card ${CARD}` });
    });
    try {
      await hi();
      await stop.flush();
    } finally {
      off();
      stop();
    }
    vi.unstubAllGlobals();
    const server = memoryExporter();
    const observability = defineObservability({ exporters: [server], env: {} });
    const relay = observability.relay({ allowMissingOrigin: true });
    for (const body of posts) {
      const res = await relay(
        new Request("http://localhost/api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body }),
      );
      expect(res.status).toBe(202);
    }
    await observability.flush();
    const custom = server.spans.find((s) => s.name === "prompt.build")!;
    expect(custom.attributes["webmcp.custom"]).toBe(true);
    expect(custom.parentSpanId).toBe(server.spans.find((s) => s.name === "invoke_agent shopper")!.spanId);
    expect(server).not.toContainSensitive(["4242"]);
  });
});
