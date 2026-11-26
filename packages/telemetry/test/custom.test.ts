/**
 * The app's own spans on the server (`observability.span`, `observability.event`) behind the real chat handler:
 * parented in the request's trace, sampled with it, redacted and filtered like the model spans, and a no-op outside a
 * chat request.
 */
import { InMemorySpanExporter, type ReadableSpan, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { type ChatHandlerOptions, createChatHandler } from "@webmcp-agents/chat/server";
import { chatRequest, mockModel, readChatStream, text, toolCall } from "@webmcp-agents/testing/server";
import { jsonSchema, tool } from "ai";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineObservability, type ObservabilityConfig } from "../src/server";

const REF = { conversation: "conv-1", run: "run-1", step: 1 };
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const RUN_SPAN = "b7ad6b7169203331";
const TRACEPARENT = `00-${TRACE_ID}-${RUN_SPAN}-01`;
const CARD = "4242 4242 4242 4242";

type Handler = ChatHandlerOptions;

/** A layer exporting to memory, and one chat request through the handler with `options`, read to the end. */
function setup(config: ObservabilityConfig = {}) {
  const memory = new InMemorySpanExporter();
  const observability = defineObservability({ exporters: [memory], env: {}, ...config });
  const turn = async (options: Partial<Handler> = {}, headers: Record<string, string> = { traceparent: TRACEPARENT }) => {
    const handler = createChatHandler({ model: mockModel([text("ok")]), observability, ...options } as Handler);
    const res = await handler(chatRequest({ messages: ["hi"], trace: REF }, { headers }));
    await readChatStream(res);
    await observability.flush();
    return res;
  };
  const span = (name: string): ReadableSpan | undefined => memory.getFinishedSpans().find((s) => s.name === name);
  return { memory, observability, turn, span };
}

/** `prepareAgent` that adds one server-side tool whose `execute` is `run`. */
const serverTool = (run: () => unknown): Pick<Handler, "prepareAgent"> => ({
  prepareAgent: (settings) => ({
    ...settings,
    tools: { ...settings.tools, lookup: tool({ description: "Look up.", inputSchema: jsonSchema({ type: "object" }), execute: run }) },
  }),
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("inside a chat request", () => {
  test("a server-side tool's span: a child of the browser's run span, in its trace, with the request's ids; fn's value returned", async () => {
    const { turn, span, observability } = setup();
    let value: unknown;
    await turn({
      model: mockModel([toolCall("lookup", {}), text("ok")]),
      ...serverTool(async () => {
        value = await observability.span(
          "inventory.lookup",
          async () => {
            await new Promise((r) => setTimeout(r, 20));
            return 7;
          },
          { "inventory.sku": "mug-01", "webmcp.run.id": "forged" },
        );
        return "found";
      }),
    });
    expect(value).toBe(7);
    const custom = span("inventory.lookup")!;
    expect(custom.spanContext().traceId).toBe(TRACE_ID);
    expect(custom.parentSpanContext?.spanId).toBe(RUN_SPAN);
    expect(custom.attributes).toMatchObject({ "inventory.sku": "mug-01", "webmcp.custom": true, "webmcp.run.id": "run-1" });
    const ms = (custom.endTime[0] - custom.startTime[0]) * 1000 + (custom.endTime[1] - custom.startTime[1]) / 1e6;
    expect(ms).toBeGreaterThanOrEqual(15);
    expect(custom.instrumentationScope.name).toBe("@webmcp-agents/telemetry");
  });

  test("code awaited before the model call (telemetry.metadata) and a nested span: parented in the request's trace", async () => {
    const { turn, span, observability } = setup();
    await turn({
      telemetry: {
        metadata: () => observability.span("outer", () => observability.span("inner", async () => ({}))),
      },
    });
    expect(span("outer")!.parentSpanContext?.spanId).toBe(RUN_SPAN);
    expect(span("inner")!.parentSpanContext?.spanId).toBe(span("outer")!.spanContext().spanId);
    expect(span("inner")!.spanContext().traceId).toBe(TRACE_ID);
  });

  test("an event: a zero-length span with the attributes, redacted (a card number masked)", async () => {
    const { turn, span, memory, observability } = setup();
    await turn({
      prepareAgent: (settings) => {
        observability.event("payment.checked", { "payment.card": CARD, "payment.note": `card ${CARD}` });
        return settings;
      },
    });
    const event = span("payment.checked")!;
    expect(event.parentSpanContext?.spanId).toBe(RUN_SPAN);
    expect(event.startTime).toEqual(event.endTime);
    expect(Object.keys(event.attributes)).toEqual(expect.arrayContaining(["payment.card", "payment.note", "webmcp.custom"]));
    expect(JSON.stringify(memory.getFinishedSpans().map((s) => s.attributes))).not.toContain("4242");
  });

  test("a throw or a rejection: error status with error.type, the error passed on unchanged, the message redacted", async () => {
    const { turn, span, memory, observability } = setup();
    const thrown = new RangeError(`bad card ${CARD}`);
    const caught: unknown[] = [];
    await turn({
      telemetry: {
        metadata: async () => {
          try {
            observability.span("sync.fail", () => {
              throw thrown;
            });
          } catch (err) {
            caught.push(err);
          }
          await observability.span("async.fail", () => Promise.reject(thrown)).catch((err: unknown) => caught.push(err));
          return {};
        },
      },
    });
    expect(caught).toEqual([thrown, thrown]);
    for (const name of ["sync.fail", "async.fail"]) {
      expect(span(name)!.status.code).toBe(2);
      expect(span(name)!.attributes["error.type"]).toBe("RangeError");
    }
    expect(JSON.stringify(memory.getFinishedSpans().map((s) => s.status))).not.toContain("4242");
  });

  test("a page that does not record its run (no traceparent): the span joins the request's own trace, under its root", async () => {
    const { turn, memory, span, observability } = setup();
    await turn(
      {
        model: mockModel([toolCall("lookup", {}), text("ok")]),
        ...serverTool(() => observability.span("inventory.lookup", () => "found")),
      },
      {},
    );
    const root = memory.getFinishedSpans().find((s) => s.name.startsWith("invoke_agent"))!;
    expect(span("inventory.lookup")!.spanContext().traceId).toBe(root.spanContext().traceId);
    expect(span("inventory.lookup")!.parentSpanContext?.spanId).toBe(root.spanContext().spanId);
  });

  test("a guard, given { request }: in the request's trace (once the layer is built)", async () => {
    const { turn, span, observability } = setup();
    const guard = (req: Request) => {
      observability.event("guard.passed", {}, { request: req });
      return undefined;
    };
    await turn({ guard });
    // the first request's guard runs before the layer is built: not recorded
    expect(span("guard.passed")).toBeUndefined();
    await turn({ guard });
    expect(span("guard.passed")!.parentSpanContext?.spanId).toBe(RUN_SPAN);
  });
});

describe("sampling, filter, and outside a request", () => {
  test("a request that is not sampled: no custom span, fn runs and its value comes back", async () => {
    const { turn, memory, observability } = setup({ sampling: { type: "never" } });
    let value: unknown;
    await turn({
      telemetry: {
        metadata: () => {
          value = observability.span("never", () => 42);
          return {};
        },
      },
    });
    expect(value).toBe(42);
    expect(memory.getFinishedSpans()).toEqual([]);
  });

  test("spanFilter can drop a custom span (webmcp.custom) and keep the model spans", async () => {
    const { turn, memory, observability } = setup({ spanFilter: (s) => s.attributes["webmcp.custom"] !== true });
    await turn({
      telemetry: {
        metadata: () => {
          observability.event("dropped");
          return {};
        },
      },
    });
    expect(memory.getFinishedSpans().map((s) => s.name)).toEqual(["chat mock-model-id"]);
  });

  test("through the app's own provider: created by it, redacted before it sees them, and the filter applies at start", async () => {
    const memory = new InMemorySpanExporter();
    const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: memory })] });
    const observability = defineObservability({
      tracerProvider: provider,
      env: {},
      spanFilter: (s) => s.name !== "dropped",
    });
    const handler = createChatHandler({
      model: mockModel([text("ok")]),
      observability,
      telemetry: {
        metadata: () => {
          observability.event("kept", { note: `card ${CARD}` });
          observability.event("dropped");
          return {};
        },
      },
    });
    await readChatStream(await handler(chatRequest({ messages: ["hi"], trace: REF }, { headers: { traceparent: TRACEPARENT } })));
    await observability.flush();
    const spans = memory.getFinishedSpans();
    expect(spans.map((s) => s.name).sort()).toEqual(["chat mock-model-id", "kept"]);
    const kept = spans.find((s) => s.name === "kept")!;
    expect(kept.parentSpanContext?.spanId).toBe(RUN_SPAN);
    expect(JSON.stringify(kept.attributes)).not.toContain("4242");
  });

  test("outside a chat request: a no-op, even once the layer is built; fn's value comes back", async () => {
    const { turn, memory, observability } = setup();
    expect(observability.span("before", () => 1)).toBe(1);
    await turn();
    memory.reset();
    expect(observability.span("after", () => 2)).toBe(2);
    expect(await observability.span("after.async", async () => 3)).toBe(3);
    observability.event("after.event");
    await observability.flush();
    expect(memory.getFinishedSpans()).toEqual([]);
  });
});
