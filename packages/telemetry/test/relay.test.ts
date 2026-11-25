/**
 * The relay (design §7.6): the browser is not trusted. Every refusal is a 4xx with no body and forwards nothing; what
 * is accepted is redacted again, sampled by the server, sent through the same pipeline as the server's spans, and
 * answered `202` with no body whatever happens upstream. Failure paths first. (R-EXP-4, R-EXP-7)
 */
import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { createChatHandler } from "@webmcp-agents/chat/server";
import "@webmcp-agents/testing/matchers";
import { chatRequest, mockModel, readChatStream, text } from "@webmcp-agents/testing/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { otlpBody } from "../src/browser/exporters";
import type { SpanRecord } from "../src/browser/types";
import { defineObservability, type ObservabilityConfig, RELAY_MAX_BYTES, type TelemetryRelayOptions } from "../src/server";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const RUN_SPAN = "00f067aa0ba902b7";
const URL_ = "https://shop.example/api/telemetry";

const span = (over: Partial<SpanRecord> = {}): SpanRecord => ({
  name: "invoke_agent shopper",
  traceId: TRACE_ID,
  spanId: RUN_SPAN,
  startTime: 1_764_000_000_000,
  endTime: 1_764_000_001_500,
  attributes: { "gen_ai.operation.name": "invoke_agent", "webmcp.conversation.id": "conv-r", "webmcp.run.id": "run-r" },
  events: [],
  status: { code: "unset" },
  ...over,
});

const post = (body: unknown, init: { headers?: Record<string, string>; method?: string; raw?: string } = {}) =>
  new Request(URL_, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...init.headers },
    ...(init.method === "GET" ? {} : { body: init.raw ?? JSON.stringify(body) }),
  });

function relayTo(config: ObservabilityConfig = {}, options?: TelemetryRelayOptions) {
  const memory = new InMemorySpanExporter();
  const observability = defineObservability({ exporters: [memory], env: {}, ...config });
  const relay = observability.relay(options);
  return {
    memory,
    observability,
    async send(req: Request) {
      const res = await relay(req);
      await observability.flush();
      return res;
    },
  };
}

/** A refusal: the status, and nothing in the body. */
async function refused(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(await res.text()).toBe("");
}

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  trace.disable();
  vi.restoreAllMocks();
});

describe("refusals: a 4xx with no detail, nothing forwarded (R-EXP-4)", () => {
  test("a cross-site request", async () => {
    const r = relayTo();
    await refused(await r.send(post(otlpBody({}, [span()]), { headers: { origin: "https://evil.example" } })), 403);
    expect(r.memory.getFinishedSpans()).toEqual([]);
  });

  test("a method other than POST", async () => {
    await refused(await relayTo().send(post(undefined, { method: "GET" })), 405);
  });

  test("a wrong content type", async () => {
    const r = relayTo();
    await refused(await r.send(post(otlpBody({}, [span()]), { headers: { "content-type": "text/plain" } })), 415);
    expect(r.memory.getFinishedSpans()).toEqual([]);
  });

  test("a body over the default 256 KB (declared, or streamed without a length)", async () => {
    expect(RELAY_MAX_BYTES).toBe(256 * 1024);
    const r = relayTo();
    const big = JSON.stringify(otlpBody({ pad: "x".repeat(RELAY_MAX_BYTES) }, [span()]));
    await refused(await r.send(post(undefined, { raw: big })), 413);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const chunked = new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await refused(await r.send(chunked), 413);
    expect(r.memory.getFinishedSpans()).toEqual([]);
  });

  test("maxBytes lowers the cap", async () => {
    await refused(await relayTo({}, { maxBytes: 100 }).send(post(otlpBody({}, [span()]))), 413);
  });

  test("malformed JSON", async () => {
    await refused(await relayTo().send(post(undefined, { raw: '{"resourceSpans": [' })), 400);
  });

  test.each([
    ["not OTLP", { spans: [] }],
    ["a trace id that is not 32 hex digits", otlpBody({}, [span({ traceId: "nothex" })])],
    ["an all-zero span id", otlpBody({}, [span({ spanId: "0000000000000000" })])],
    ["a span without a name", otlpBody({}, [span({ name: "" })])],
  ])("a malformed body: %s", async (_, body) => {
    const r = relayTo();
    await refused(await r.send(post(body)), 400);
    expect(r.memory.getFinishedSpans()).toEqual([]);
  });

  test("spans from another instrumentation scope (anything but @webmcp-agents/telemetry)", async () => {
    const body = otlpBody({}, [span()]);
    body.resourceSpans[0]!.scopeSpans[0]!.scope.name = "@opentelemetry/instrumentation-fetch";
    const r = relayTo();
    await refused(await r.send(post(body)), 400);
    expect(r.memory.getFinishedSpans()).toEqual([]);
  });

  test("the app's guard answers: that response is sent and nothing is forwarded", async () => {
    const r = relayTo({}, { guard: () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }) });
    const res = await r.send(post(otlpBody({}, [span()])));
    expect(res.status).toBe(429);
    expect(r.memory.getFinishedSpans()).toEqual([]);
  });

  test("a guard that throws refuses with 500 and no detail", async () => {
    await refused(
      await relayTo(
        {},
        {
          guard: () => {
            throw new Error("db down: password=hunter2");
          },
        },
      ).send(post(otlpBody({}, [span()]))),
      500,
    );
  });
});

describe("what is accepted (R-EXP-4)", () => {
  test("202 with no body; the spans keep their ids and parents, under this package's scope", async () => {
    const r = relayTo();
    const call = span({
      name: "execute_tool add_to_cart",
      spanId: "1111111111111111",
      parentSpanId: RUN_SPAN,
      startTime: 1_764_000_000_500,
      endTime: 1_764_000_000_900,
    });
    const res = await r.send(post(otlpBody({ "service.name": "shop.example" }, [call, span()])));
    await refused(res, 202);
    const spans = r.memory.getFinishedSpans();
    expect(spans.map((s) => [s.name, s.spanContext().spanId, s.parentSpanContext?.spanId])).toEqual([
      ["execute_tool add_to_cart", "1111111111111111", RUN_SPAN],
      ["invoke_agent shopper", RUN_SPAN, undefined],
    ]);
    expect(spans[0]!.instrumentationScope.name).toBe("@webmcp-agents/telemetry");
    expect(spans[1]!.endTime).toEqual([1_764_000_001, 500_000_000]);
  });

  test("the relayed run span and the server's step span make one trace", async () => {
    const r = relayTo();
    await r.send(post(otlpBody({}, [span()])));
    const handler = createChatHandler({ model: mockModel([text("ok")]), observability: r.observability });
    await readChatStream(
      await handler(
        chatRequest(
          { messages: ["hi"], trace: { conversation: "conv-r", run: "run-r", step: 1 } },
          { headers: { traceparent: `00-${TRACE_ID}-${RUN_SPAN}-01` } },
        ),
      ),
    );
    await r.observability.flush();
    expect(
      r.memory
        .getFinishedSpans()
        .map((s) => s.name)
        .sort(),
    ).toEqual(["chat mock-model-id", "invoke_agent shopper"]);
    expect(r.memory.getFinishedSpans()).toBeOneTrace();
  });

  test("the relay redacts again: a card number in an attribute is forwarded redacted", async () => {
    const r = relayTo();
    await r.send(
      post(
        otlpBody({}, [
          span({
            attributes: { "gen_ai.tool.call.arguments": '{"card":"4242 4242 4242 4242"}', note: "mail sara@example.com" },
            events: [{ name: "webmcp.park", time: 1_764_000_000_100, attributes: { prompt: "Confirm 4242 4242 4242 4242" } }],
          }),
        ]),
      ),
    );
    const dump = JSON.stringify(r.memory.getFinishedSpans().map((s) => ({ a: s.attributes, e: s.events })));
    expect(dump).not.toContain("4242");
    expect(dump).not.toContain("sara@example.com");
    expect(dump).toContain("REDACTED");
  });

  test("server-side attributes become resource attributes; the browser's resource is not trusted", async () => {
    const r = relayTo({ serviceName: "field-store" }, { attributes: () => ({ "service.version": "abc123", "cloud.region": "fra1" }) });
    await r.send(post(otlpBody({ "service.name": "evil.example" }, [span()])));
    expect(r.memory.getFinishedSpans()[0]!.resource.attributes).toMatchObject({
      "service.name": "field-store",
      "service.version": "abc123",
      "cloud.region": "fra1",
    });
  });

  test("an attributes() that throws: the spans go without them", async () => {
    const r = relayTo(
      {},
      {
        attributes: () => {
          throw new Error("no");
        },
      },
    );
    expect((await r.send(post(otlpBody({}, [span()])))).status).toBe(202);
    expect(r.memory.getFinishedSpans()).toHaveLength(1);
  });

  test("the browser's sampled flag is ignored: the server's sampling decides", async () => {
    const body = otlpBody({}, [span()]);
    (body.resourceSpans[0]!.scopeSpans[0]!.spans[0] as Record<string, unknown>).flags = 0;
    const kept = relayTo();
    await kept.send(post(body));
    expect(kept.memory.getFinishedSpans()).toHaveLength(1);
    const dropped = relayTo({ sampling: { type: "never" } });
    expect((await dropped.send(post(otlpBody({}, [span()])))).status).toBe(202);
    expect(dropped.memory.getFinishedSpans()).toEqual([]);
  });

  test("the backend rejects: still 202 with no body, nothing about the upstream error", async () => {
    const failing = {
      export: (_: unknown, done: (r: { code: number; error: Error }) => void) =>
        done({ code: 1, error: new Error("403 Forbidden: bad x-api-key lsv2_secret") }),
      shutdown: async () => {},
    };
    const observability = defineObservability({ exporters: [failing], env: {} });
    const res = await observability.relay()(post(otlpBody({}, [span()])));
    await observability.flush();
    await refused(res, 202);
  });

  test("the relay hands its flush to the host's waitUntil when there is one", async () => {
    const waited: Promise<unknown>[] = [];
    const r = relayTo();
    const res = await r.observability.relay()(post(otlpBody({}, [span()])), { waitUntil: (p: Promise<unknown>) => waited.push(p) });
    expect(res.status).toBe(202);
    expect(waited).toHaveLength(1);
    await waited[0];
    expect(r.memory.getFinishedSpans()).toHaveLength(1);
  });
});

describe("the kill switch and the same pipeline (R-EXP-7, R-EXP-4)", () => {
  test("OTEL_SDK_DISABLED=true: the browser posts spans, the relay answers 202, nothing is exported", async () => {
    const r = relayTo({ env: { OTEL_SDK_DISABLED: "true" } });
    await refused(await r.send(post(otlpBody({}, [span()]))), 202);
    expect(r.memory.getFinishedSpans()).toEqual([]);
  });

  test("telemetry off for any reason: accepted and dropped", async () => {
    const observability = defineObservability({ env: {} });
    await refused(await observability.relay()(post(otlpBody({}, [span()]))), 202);
  });

  test("the server exports through an app's global provider: relayed spans reach that same provider, parents first, one trace", async () => {
    const memory = new InMemorySpanExporter();
    trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: memory })] }));
    const observability = defineObservability({ env: {} });
    const call = span({ name: "execute_tool add_to_cart", spanId: "1111111111111111", parentSpanId: RUN_SPAN });
    const res = await observability.relay({ attributes: () => ({ "service.version": "abc123" }) })(post(otlpBody({}, [call, span()])));
    await observability.flush();
    expect(res.status).toBe(202);
    const spans = memory.getFinishedSpans();
    expect(spans.map((s) => s.name).sort()).toEqual(["execute_tool add_to_cart", "invoke_agent shopper"]);
    const run = spans.find((s) => s.name.startsWith("invoke_agent"))!;
    const tool = spans.find((s) => s.name.startsWith("execute_tool"))!;
    expect(tool.parentSpanContext?.spanId).toBe(run.spanContext().spanId);
    expect(spans.every((s) => s.spanContext().traceId === TRACE_ID)).toBe(true);
    // the provider's resource is the app's: server attributes go on the spans
    expect(run.attributes["service.version"]).toBe("abc123");
  });
});
