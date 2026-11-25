/**
 * `observeAgents()` on a real page, with real runs: one turn through the cloud adapter and the real chat handler is one
 * trace (browser + server), consent is read at each run's start, spans go to the relay (or the console, or the page's
 * own OpenTelemetry provider), are sent before the page goes, and stop when observing stops. Failure paths first.
 * (R-EXP-4, R-EXP-7)
 */
import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { createCloudAdapter, defineWebAgent } from "@webmcp-agents/chat";
import { defineWebTool, registerWebTool } from "@webmcp-agents/core";
import { expect, modelContext, test, uniqueName, until } from "@webmcp-agents/testing";
import { mockAdapter, mockChatServer, text, toolCall } from "@webmcp-agents/testing/chat";
import { memoryExporter, spanTree } from "@webmcp-agents/testing/telemetry";
import { afterEach, beforeAll, describe, vi } from "vitest";
import { render } from "vitest-browser-react";
import { consoleExporter, observeAgents } from "../src";
import { ObserveAgents } from "../src/react";
import { defineObservability } from "../src/server";

const agent = defineWebAgent({ id: "shopper", instructions: "Shop." });
const hi = () => agent.invoke("Hi.", { adapter: mockAdapter([text("Hello.")]) });

/** Every fetch the page makes, answered with `status`. */
function stubFetch(status = 202) {
  const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: String(init.body ?? ""), headers: Object.fromEntries(new Headers(init.headers).entries()) });
    return new Response(null, { status });
  });
  return calls;
}
const names = (body: string): string[] =>
  JSON.parse(body).resourceSpans.flatMap((r: { scopeSpans: { spans: { name: string }[] }[] }) =>
    r.scopeSpans.flatMap((s) => s.spans.map((x) => x.name)),
  );

beforeAll(() => modelContext());
afterEach(() => {
  trace.disable();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("failures and refusals (R-EXP-4, R-EXP-7)", () => {
  test("the relay answers 404 (there is none): nothing more is sent, the runs are unaffected", async () => {
    const calls = stubFetch(404);
    const stop = observeAgents({ batchSize: 1 });
    try {
      await hi();
      await stop.flush();
      const sent = calls.length;
      expect(sent).toBeGreaterThan(0);
      expect(await hi()).toHaveAnswered("Hello.");
      await stop.flush();
      expect(calls).toHaveLength(sent);
    } finally {
      stop();
    }
  });

  test("consent: enabled() false for one run and true for the next: only the second is exported, the first sends nothing", async () => {
    const calls = stubFetch();
    let consent = false;
    const stop = observeAgents({ enabled: () => consent });
    try {
      await hi();
      await stop.flush();
      expect(calls).toEqual([]);
      consent = true;
      await agent.invoke("Again.", { adapter: mockAdapter([text("Hi again.")]) });
      await stop.flush();
      expect(calls).toHaveLength(1);
      expect(names(calls[0]!.body)).toContain("invoke_agent shopper");
    } finally {
      stop();
    }
  });

  test("an enabled() that throws counts as no consent", async () => {
    const calls = stubFetch();
    const stop = observeAgents({
      enabled: () => {
        throw new Error("consent store down");
      },
    });
    await hi();
    await stop.flush();
    stop();
    expect(calls).toEqual([]);
  });

  test("stopping: buffered spans are sent, and no later run is observed", async () => {
    const calls = stubFetch();
    const stop = observeAgents();
    await hi();
    stop();
    await until(() => calls.length === 1, 3000, "the flush on stop");
    await hi();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(1);
  });
});

describe("one turn, one trace (R-EXP-4)", () => {
  test("two model steps and a tool call through the cloud adapter and the real handler: invoke_agent with two chat children and one execute_tool child", async () => {
    const add = defineWebTool({
      id: uniqueName("add_to_cart"),
      description: "Add a mug to the cart.",
      inputSchema: { type: "object", properties: { qty: { type: "number" } } },
      execute: ({ qty }: { qty?: number }) => `Added ${qty ?? 1}.`,
    });
    const off = registerWebTool(add);
    const server = memoryExporter();
    const browser = memoryExporter();
    const observability = defineObservability({ exporters: [server], env: {} });
    const shopper = defineWebAgent({ id: "shopper", instructions: "Shop.", tools: [add] });
    const chat = mockChatServer({ steps: [toolCall(add.id, { qty: 2 }), text("Done.")], handler: { agents: [shopper], observability } });
    const stop = observeAgents({ exporters: [browser], batchSize: 1 });
    try {
      expect(await shopper.invoke("Two mugs.", { adapter: createCloudAdapter({ fetch: chat.fetch }) })).toHaveAnswered("Done.");
      await stop.flush();
      await observability.flush();
      const spans = [...browser.spans, ...server.spans];
      expect(spans).toBeOneTrace();
      const [run] = spanTree(spans);
      expect(run!.span.name).toBe("invoke_agent shopper");
      expect(run!.children.map((c) => c.span.name)).toEqual(["chat mock-model-id", `execute_tool ${add.id}`, "chat mock-model-id"]);
      expect(server.spans.map((s) => s.attributes["webmcp.step"])).toEqual([1, 2]);
      expect(spans).toHaveSpan(`execute_tool ${add.id}`, {
        "webmcp.tool.state": "done",
        "webmcp.conversation.id": run!.span.attributes["webmcp.conversation.id"],
      });
    } finally {
      stop();
      off();
    }
  });

  test("the page posts only to its own relay, with no backend header: the key stays on the server", async () => {
    const calls = stubFetch();
    const stop = observeAgents();
    await hi();
    await stop.flush();
    stop();
    expect(calls.every((c) => c.url === "/api/telemetry")).toBe(true);
    expect(Object.keys(calls[0]!.headers)).toEqual(["content-type"]);
  });
});

describe("where spans go (R-EXP-4)", () => {
  test("consoleExporter() as the only exporter: each span printed, no request", async () => {
    const calls = stubFetch();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const stop = observeAgents({ exporters: [consoleExporter()], batchSize: 1 });
    await hi();
    await stop.flush();
    stop();
    expect(calls).toEqual([]);
    expect(log.mock.calls.map(([m]) => m)).toEqual(expect.arrayContaining(["[web-agents/telemetry] invoke_agent shopper"]));
  });

  test("a relay URL and an OTLP target as exporters", async () => {
    const calls = stubFetch();
    const stop = observeAgents({ exporters: ["/telemetry", { endpoint: "https://collector.example" }], batchSize: 64 });
    await hi();
    await stop.flush();
    stop();
    expect(calls.map((c) => c.url).sort()).toEqual(["/telemetry", "https://collector.example/v1/traces"]);
  });

  test("leaving the page: buffered spans are sent on pagehide, before the 2 s batch", async () => {
    const calls = stubFetch();
    const stop = observeAgents();
    try {
      await hi();
      await until(() => document.readyState === "complete", 1000, "the page");
      expect(calls).toEqual([]); // still in the 2 s batch
      dispatchEvent(new PageTransitionEvent("pagehide"));
      await until(() => calls.length === 1, 3000, "the pagehide flush");
    } finally {
      stop();
    }
  });

  test("the page already runs OpenTelemetry: browser spans go through its provider (the bridge), in the run's trace", async () => {
    const calls = stubFetch();
    const memory = new InMemorySpanExporter();
    trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: memory })] }));
    const stop = observeAgents();
    try {
      await hi();
      await stop.flush();
      await until(() => memory.getFinishedSpans().length >= 2, 3000, "spans in the page's provider");
      expect(calls).toEqual([]);
      const spans = memory.getFinishedSpans();
      expect(spans.map((s) => s.name).sort()).toEqual(["chat mock/model", "invoke_agent shopper"]);
      expect(new Set(spans.map((s) => s.spanContext().traceId)).size).toBe(1);
      expect(spans.every((s) => s.instrumentationScope.name === "@webmcp-agents/telemetry")).toBe(true);
    } finally {
      stop();
    }
  });

  test("a tracer provider passed in is used as is", async () => {
    const memory = new InMemorySpanExporter();
    const stop = observeAgents({ tracerProvider: new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: memory })] }) });
    await hi();
    await stop.flush();
    await until(() => memory.getFinishedSpans().length >= 2, 3000, "spans in the provider");
    stop();
  });
});

describe("<ObserveAgents> (R-EXP-7)", () => {
  test("observes while mounted, reads the latest enabled() at each run, stops on unmount", async () => {
    const calls = stubFetch();
    let consent = false;
    const screen = await render(<ObserveAgents enabled={() => consent} batchSize={1} />);
    await hi();
    consent = true;
    await screen.rerender(<ObserveAgents enabled={() => consent} batchSize={1} />);
    await hi();
    await until(() => calls.length > 0, 3000, "the second run's spans");
    const sent = calls.length;
    await screen.unmount();
    await hi();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(sent);
  });
});
