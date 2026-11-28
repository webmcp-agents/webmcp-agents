/**
 * The kit's telemetry pieces: `memoryExporter` (both sides' shapes), `spanTree`, `toHaveSpan`, `toBeOneTrace`, and
 * `toContainSensitive` on spans. Each matcher passes, fails with a worded message, works negated, and refuses input it
 * cannot read. Failure paths first.
 */
import { describe, expect, test } from "vitest";
import "../src/matchers";
import { memoryExporter, readSpans, recordSpan, spanTree } from "../src/telemetry";

async function failure(assertion: () => unknown): Promise<string> {
  try {
    await assertion();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error("the assertion passed, but it should have failed");
}

const T = "4bf92f3577b34da6a3ce929d0e0e4736";
/** A browser span record. */
const rec = (name: string, spanId: string, parentSpanId?: string, attributes: Record<string, unknown> = {}, traceId = T) => ({
  name,
  traceId,
  spanId,
  ...(parentSpanId ? { parentSpanId } : {}),
  startTime: Number.parseInt(spanId, 16),
  endTime: Number.parseInt(spanId, 16) + 1,
  attributes,
  events: [],
  status: { code: "unset" },
});
/** An OpenTelemetry ReadableSpan (the fields the kit reads). */
const readable = (name: string, spanId: string, parent?: string) => ({
  name,
  spanContext: () => ({ traceId: T, spanId, traceFlags: 1 }),
  ...(parent ? { parentSpanContext: { traceId: T, spanId: parent, traceFlags: 1 } } : {}),
  attributes: { "gen_ai.request.model": "m" },
  events: [{ name: "e", time: [1, 0], attributes: { a: 1 } }],
  status: { code: 2 },
  startTime: [1, 500_000_000] as [number, number],
  endTime: [2, 0] as [number, number],
  instrumentationScope: { name: "@webmcp-agents/telemetry" },
});

const turn = () => {
  const m = memoryExporter();
  m.export([
    rec("execute_tool add", "0000000000000002", "0000000000000001", { "webmcp.tool.state": "done" }),
    rec("invoke_agent shopper", "0000000000000001"),
  ]);
  let done: unknown;
  m.export([readable("chat model", "0000000000000003", "0000000000000001")], (r) => (done = r));
  expect(done).toEqual({ code: 0 });
  return m;
};

describe("wrong input", () => {
  test("toHaveSpan and toBeOneTrace refuse what is not spans, also negated", async () => {
    expect(await failure(() => expect(42).toHaveSpan("x"))).toContain("toHaveSpan needs spans");
    expect(await failure(() => expect({}).not.toBeOneTrace())).toContain("toBeOneTrace needs spans");
    expect(readSpans([{ nope: true }])).toBeUndefined();
  });

  test("recordSpan ignores what is not a span", () => {
    expect(recordSpan(null)).toBeUndefined();
    expect(recordSpan({ name: "x" })).toBeUndefined();
  });

  test("no spans at all is not one trace", async () => {
    expect(await failure(() => expect(memoryExporter()).toBeOneTrace())).toContain("there are no spans");
  });
});

describe("memoryExporter", () => {
  test("keeps both sides' spans in one shape; reset forgets them", () => {
    const m = turn();
    expect(m.spans.map((s) => [s.name, s.parentSpanId])).toEqual([
      ["execute_tool add", "0000000000000001"],
      ["invoke_agent shopper", undefined],
      ["chat model", "0000000000000001"],
    ]);
    expect(m.spans[2]).toMatchObject({
      status: "error",
      startTime: 1500,
      endTime: 2000,
      scope: "@webmcp-agents/telemetry",
      events: [{ name: "e", attributes: { a: 1 } }],
    });
    m.reset();
    expect(m.spans).toEqual([]);
  });

  test("reads an InMemorySpanExporter-like object (getFinishedSpans) and span trees", () => {
    expect(readSpans({ getFinishedSpans: () => [readable("a", "0000000000000009")] })?.map((s) => s.name)).toEqual(["a"]);
    expect(readSpans(spanTree(turn().spans))?.length).toBe(3);
  });
});

describe("spanTree", () => {
  test("roots with their children, in start order", () => {
    const [root, ...rest] = spanTree(turn().spans);
    expect(rest).toEqual([]);
    expect(root!.span.name).toBe("invoke_agent shopper");
    expect(root!.children.map((c) => c.span.name)).toEqual(["execute_tool add", "chat model"]);
  });
});

describe("toHaveSpan", () => {
  test("passes on a name (or RegExp) with matching attributes, asymmetric matchers included", () => {
    const m = turn();
    expect(m).toHaveSpan("execute_tool add");
    expect(m).toHaveSpan("execute_tool add", { "webmcp.tool.state": "done" });
    expect(m).toHaveSpan(/^chat /, { "gen_ai.request.model": expect.any(String) });
    expect(m).not.toHaveSpan("execute_tool add", { "webmcp.tool.state": "error" });
    expect(m.spans).toHaveSpan("invoke_agent shopper");
  });

  test("a /g RegExp name matches every time (its lastIndex is reset)", () => {
    const m = turn();
    const name = /execute_tool/g;
    expect(m).toHaveSpan(name);
    expect(m).toHaveSpan(name);
  });

  test("fails saying which spans exist, or what the closest one has", async () => {
    const m = turn();
    expect(await failure(() => expect(m).toHaveSpan("execute_tool pay"))).toMatch(/there is none\. Spans:\n {4}execute_tool add/);
    const message = await failure(() => expect(m).toHaveSpan("execute_tool add", { "webmcp.tool.state": "error" }));
    expect(message).toContain('webmcp.tool.state: "done" (expected "error")');
    expect(await failure(() => expect(m).not.toHaveSpan("execute_tool add"))).toContain("Expected no span");
  });
});

describe("toBeOneTrace", () => {
  test("passes for one trace with one root", () => {
    expect(turn()).toBeOneTrace();
  });

  test("fails naming the traces, or the roots", async () => {
    const two = memoryExporter();
    two.export([rec("a", "0000000000000001"), rec("b", "0000000000000002", undefined, {}, "11111111111111111111111111111111")]);
    expect(await failure(() => expect(two).toBeOneTrace())).toContain("they belong to 2 traces");
    const roots = memoryExporter();
    roots.export([rec("a", "0000000000000001"), rec("b", "0000000000000002")]);
    expect(await failure(() => expect(roots).toBeOneTrace())).toContain('there are 2 roots: "a", "b"');
    expect(await failure(() => expect(turn()).not.toBeOneTrace())).toContain(
      'not to form one trace with one root, but they do (root "invoke_agent shopper")',
    );
  });
});

describe("toContainSensitive on spans", () => {
  test("names the span a value was found in", async () => {
    const m = memoryExporter();
    m.export([rec("execute_tool pay", "0000000000000001", undefined, { "gen_ai.tool.call.arguments": '{"card":"4242"}' })]);
    expect(m).not.toContainSensitive(["A1234567"]);
    const message = await failure(() => expect(m).not.toContainSensitive(["4242"]));
    expect(message).toContain("Found in the spans");
    expect(message).toContain("execute_tool pay");
  });
});
