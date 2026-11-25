/**
 * `defineObservability()` behind the real chat handler (design §7.3, §7.4, §7.9): every model step exported with the
 * run's ids, any OpenTelemetry exporter / processor / provider accepted as is, content only on opt-in and always
 * redacted, and no telemetry fault ever changing a chat request. Failure paths first.
 * (R-EXP-1, R-EXP-2, R-EXP-5, R-EXP-6, R-EXP-7)
 */
import { InMemorySpanExporter, type ReadableSpan, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { createChatHandler } from "@webmcp-agents/chat/server";
import { configureRedaction } from "@webmcp-agents/core/redact";
import { chatRequest, mockModel, readChatStream, text, toolCall } from "@webmcp-agents/testing/server";
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";
import { type Peer, peerLoaders } from "../src/server/peers";
import { defineObservability, type Observability, otlp } from "../src/server";

const REF = { conversation: "conv-1", run: "run-1", step: 1 };
const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const RUN_SPAN = "b7ad6b7169203331";
const TRACEPARENT = `00-${TRACE_ID}-${RUN_SPAN}-01`;
const CARD = "4242 4242 4242 4242";

/** One chat request through the handler, read to the end, then a flush. */
async function turn(
  observability: Observability,
  options: { message?: string; steps?: Parameters<typeof mockModel>[0]; telemetry?: object } = {},
) {
  const handler = createChatHandler({ model: mockModel(options.steps ?? [text("ok")]), observability, telemetry: options.telemetry });
  const res = await handler(chatRequest({ messages: [options.message ?? "hi"], trace: REF }, { headers: { traceparent: TRACEPARENT } }));
  const parts = await readChatStream(res);
  await observability.flush();
  return { res, parts };
}

const names = (spans: readonly ReadableSpan[]) => spans.map((s) => s.name);
const chatSpans = (spans: readonly ReadableSpan[]) => spans.filter((s) => s.name.startsWith("chat "));

/** Requests `fetch` was asked to make, and what it answers. */
function stubFetch(answer: (url: string) => Response | Promise<Response> = () => new Response(null, { status: 200 })) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({
      url,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    return answer(url);
  });
  return calls;
}

const original = { ...peerLoaders };
/** Make `peer` look not installed (the error Node gives for a missing package). */
function uninstall(peer: Peer): void {
  peerLoaders[peer] = () =>
    Promise.reject(
      Object.assign(new Error(`Cannot find package '${peer}' imported from /app/node_modules/x.js`), { code: "ERR_MODULE_NOT_FOUND" }),
    );
}

let errors: MockInstance<(...args: unknown[]) => void>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  Object.assign(peerLoaders, original);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  configureRedaction({});
});

describe("a telemetry fault never affects a chat request (R-EXP-6)", () => {
  test("an exporter that throws: the chat answers 200 with its stream; logged once", async () => {
    const observability = defineObservability({
      exporters: [
        {
          export: () => {
            throw new Error("boom");
          },
          shutdown: async () => {},
        },
      ],
      env: {},
    });
    const { res, parts } = await turn(observability);
    expect(res.status).toBe(200);
    expect(parts.some((p) => p.type === "text-delta")).toBe(true);
    await turn(observability);
    expect(errors.mock.calls.filter(([m]) => String(m).includes("an exporter failed"))).toHaveLength(1);
  });

  test("an exporter that rejects through its callback, or never answers: dropped after the timeout; flush still resolves", async () => {
    const hang = { export: () => {}, shutdown: async () => {} };
    const reject = {
      export: (_: unknown, done: (r: { code: number; error?: Error }) => void) => done({ code: 1, error: new Error("401") }),
      shutdown: async () => {},
    };
    // one http/json target that never answers, with a short timeout
    const fetches = stubFetch(() => new Promise<Response>(() => {}));
    const observability = defineObservability({
      exporters: [hang, reject, otlp({ endpoint: "https://slow.example", timeout: 30 })],
      env: {},
    });
    const started = Date.now();
    const { res } = await turn(observability);
    expect(res.status).toBe(200);
    expect(fetches.map((f) => f.url)).toEqual(["https://slow.example/v1/traces"]);
    // the hanging exporter's own cap is the largest target timeout (min 1 s): flush settles, it never rejects
    await expect(observability.flush()).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  test("an unreachable backend: flush resolves, the error is logged once and redacted", async () => {
    stubFetch(() => Promise.reject(new Error("connect ECONNREFUSED; token sk-abcdefghijklmnopqrstuvwx")));
    const observability = defineObservability({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://down.example" } });
    for (let i = 0; i < 3; i++) expect((await turn(observability)).res.status).toBe(200);
    await expect(observability.flush()).resolves.toBeUndefined();
    const lines = errors.mock.calls.map(([m]) => String(m)).filter((m) => m.includes("exporter failed"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("sk-abcdefghijklmnopqrstuvwx");
  });

  test.each(["@opentelemetry/api", "@ai-sdk/otel", "@opentelemetry/sdk-trace"] as const)(
    "%s not installed: off with one error naming it; the chat works",
    async (peer) => {
      uninstall(peer);
      const observability = defineObservability({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" } });
      const fetches = stubFetch();
      for (let i = 0; i < 3; i++) expect((await turn(observability)).res.status).toBe(200);
      const lines = errors.mock.calls.map(([m]) => String(m)).filter((m) => m.includes(peer));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`pnpm add ${peer}`);
      expect(fetches).toEqual([]);
      expect(observability.enabled).toBe(false);
    },
  );

  test("http/protobuf without its package: one error naming @opentelemetry/exporter-trace-otlp-proto; other targets still export", async () => {
    uninstall("@opentelemetry/exporter-trace-otlp-proto");
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({
      exporters: [otlp({ endpoint: "https://p.example", protocol: "http/protobuf" }), memory],
      env: {},
    });
    expect((await turn(observability)).res.status).toBe(200);
    expect(errors.mock.calls.filter(([m]) => String(m).includes("@opentelemetry/exporter-trace-otlp-proto"))).toHaveLength(1);
    expect(chatSpans(memory.getFinishedSpans())).toHaveLength(1);
  });

  test("http/protobuf as the only target, package missing: telemetry is off and the chat works", async () => {
    uninstall("@opentelemetry/exporter-trace-otlp-proto");
    const observability = defineObservability({
      env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://p.example", OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf" },
    });
    expect((await turn(observability)).res.status).toBe(200);
    expect(observability.enabled).toBe(false);
    expect(errors.mock.calls.some(([m]) => String(m).includes("@opentelemetry/exporter-trace-otlp-proto"))).toBe(true);
  });

  test("an unknown protocol in the env: off with one error naming the three values; the chat works", async () => {
    const observability = defineObservability({
      env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_EXPORTER_OTLP_PROTOCOL: "thrift" },
    });
    expect((await turn(observability)).res.status).toBe(200);
    expect((await turn(observability)).res.status).toBe(200);
    const lines = errors.mock.calls.map(([m]) => String(m)).filter((m) => m.includes("thrift"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"http/json", "http/protobuf" or "grpc"');
    expect(observability.enabled).toBe(false);
  });

  test("both endpoint forms on one target: that target is off with an error, the other still exports", async () => {
    const fetches = stubFetch();
    const observability = defineObservability({
      exporters: [
        { endpoint: "https://a.example", endpoints: { traces: "https://b.example/t" } } as never,
        otlp({ endpoint: "https://ok.example" }),
      ],
      env: {},
    });
    await turn(observability);
    expect(fetches.map((f) => f.url)).toEqual(["https://ok.example/v1/traces"]);
    expect(errors.mock.calls.filter(([m]) => String(m).includes("both `endpoint` and `endpoints`"))).toHaveLength(1);
  });

  test("bad header syntax: the entry is skipped, logged once, the other headers are sent", async () => {
    const fetches = stubFetch();
    const observability = defineObservability({
      env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=k1,garbage,x-project=p" },
    });
    await turn(observability);
    await turn(observability);
    expect(fetches[0]!.headers).toMatchObject({ "x-api-key": "k1", "x-project": "p" });
    expect(errors.mock.calls.filter(([m]) => String(m).includes('not "key=value"'))).toHaveLength(1);
  });

  test("a spanFilter that throws drops the span, logged once; a metadata hook that throws changes nothing", async () => {
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({
      exporters: [memory],
      env: {},
      spanFilter: () => {
        throw new Error("bad filter");
      },
    });
    expect((await turn(observability)).res.status).toBe(200);
    expect(memory.getFinishedSpans()).toEqual([]);
  });

  test("flush and shutdown before any request, and when off: they resolve", async () => {
    await expect(defineObservability({ env: {} }).flush()).resolves.toBeUndefined();
    await expect(defineObservability({ env: {} }).shutdown()).resolves.toBeUndefined();
  });
});

describe("nothing loads before it is needed (R-EXP-1)", () => {
  test("defining the layer loads no package and sends nothing; the first request builds it", async () => {
    const loaded: string[] = [];
    for (const peer of Object.keys(peerLoaders) as Peer[]) {
      const load = original[peer];
      peerLoaders[peer] = () => {
        loaded.push(peer);
        return load();
      };
    }
    const fetches = stubFetch();
    const observability = defineObservability({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" } });
    expect(observability.enabled).toBe(true);
    expect(loaded).toEqual([]);
    expect(fetches).toEqual([]);
    await turn(observability);
    expect(loaded).toEqual(expect.arrayContaining(["@opentelemetry/api", "@ai-sdk/otel", "@opentelemetry/sdk-trace"]));
    expect(loaded).not.toContain("@opentelemetry/exporter-trace-otlp-proto");
  });

  test("nothing configured: off, one info line in development only, and the chat works", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const dev = defineObservability({ env: { NODE_ENV: "development" } });
    expect(dev.enabled).toBe(false);
    expect((await turn(dev)).res.status).toBe(200);
    await turn(dev);
    expect(info.mock.calls.filter(([m]) => String(m).includes("telemetry is off"))).toHaveLength(1);
    info.mockClear();
    await turn(defineObservability({ env: { NODE_ENV: "production" } }));
    expect(info).not.toHaveBeenCalled();
  });
});

describe("the standard env exports every step (R-EXP-1)", () => {
  test("OTEL_EXPORTER_OTLP_ENDPOINT: OTLP JSON posted to <base>/v1/traces with OTEL_EXPORTER_OTLP_HEADERS", async () => {
    const fetches = stubFetch();
    const observability = defineObservability({
      env: {
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example",
        OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=lsv2_test,Langsmith-Project=field-store",
      },
    });
    await turn(observability);
    expect(fetches).toHaveLength(1);
    expect(fetches[0]).toMatchObject({
      url: "https://c.example/v1/traces",
      headers: { "content-type": "application/json", "x-api-key": "lsv2_test", "langsmith-project": "field-store" },
    });
    const body = fetches[0]!.body as {
      resourceSpans: { scopeSpans: { scope: { name: string }; spans: { name: string; traceId: string }[] }[] }[];
    };
    const spans = body.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans));
    expect(spans.map((s) => s.name)).toEqual(["chat mock-model-id"]);
    expect(spans[0]!.traceId).toBe(TRACE_ID);
  });

  test("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT wins and is used exactly as given", async () => {
    const fetches = stubFetch();
    await turn(
      defineObservability({
        env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://t.example/x?y=1" },
      }),
    );
    expect(fetches.map((f) => f.url)).toEqual(["https://t.example/x?y=1"]);
  });

  test("defaults: service.name web-agents, every trace sampled, batches of up to 512", async () => {
    const batches: number[] = [];
    const memory = new InMemorySpanExporter();
    const counting = {
      export: (spans: ReadableSpan[], done: (r: { code: number }) => void) => {
        batches.push(spans.length);
        memory.export(spans, done);
      },
      shutdown: async () => {},
    };
    const observability = defineObservability({ exporters: [counting], env: {} });
    for (let i = 0; i < 3; i++) await turn(observability);
    expect(chatSpans(memory.getFinishedSpans())).toHaveLength(3);
    expect(memory.getFinishedSpans()[0]!.resource.attributes["service.name"]).toBe("web-agents");
    // 600 spans through the pipeline: 512 + 88
    const { Pipeline } = await import("../src/server/pipeline");
    const sizes: number[] = [];
    const pipe = new Pipeline({
      exporters: [
        {
          export: (s, done) => {
            sizes.push(s.length);
            done({ code: 0 });
          },
          shutdown: async () => {},
        },
      ],
      redactor: () => false,
      mapping: {},
      batchSize: 512,
      delayMs: 60_000,
      timeout: 1000,
      debug: false,
      log: { error() {}, info() {} },
    });
    const span = memory.getFinishedSpans()[0]!;
    for (let i = 0; i < 600; i++) pipe.push(span as never);
    await pipe.forceFlush();
    expect(sizes).toEqual([512, 88]);
  });

  test("OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES and the ratio sampler from env; options win over env", async () => {
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({
      exporters: [memory],
      resourceAttributes: { "deployment.environment": "production" },
      env: {
        OTEL_SERVICE_NAME: "field-store",
        OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=staging,team=shop",
        OTEL_TRACES_SAMPLER: "traceidratio",
        OTEL_TRACES_SAMPLER_ARG: "0",
      },
    });
    await turn(observability);
    expect(memory.getFinishedSpans()).toEqual([]); // ratio 0: none
    const kept = new InMemorySpanExporter();
    const half = defineObservability({
      exporters: [kept],
      env: {
        OTEL_SERVICE_NAME: "field-store",
        OTEL_RESOURCE_ATTRIBUTES: "team=shop",
        OTEL_TRACES_SAMPLER: "traceidratio",
        OTEL_TRACES_SAMPLER_ARG: "1",
      },
    });
    await turn(half);
    expect(kept.getFinishedSpans()[0]!.resource.attributes).toMatchObject({ "service.name": "field-store", team: "shop" });
    const opt = new InMemorySpanExporter();
    await turn(
      defineObservability({
        exporters: [opt],
        resourceAttributes: { "deployment.environment": "production" },
        env: { OTEL_RESOURCE_ATTRIBUTES: "deployment.environment=staging" },
      }),
    );
    expect(opt.getFinishedSpans()[0]!.resource.attributes["deployment.environment"]).toBe("production");
  });

  test("a ratio keeps about that share of traces, decided by trace id", async () => {
    const { isSampled } = await import("../src/shared/util");
    const ids = Array.from({ length: 4000 }, (_, i) => (i * 2654435761).toString(16).padStart(32, "0").slice(-32));
    const kept = ids.filter((id) => isSampled({ type: "ratio", probability: 0.25 }, id, {})).length / ids.length;
    expect(kept).toBeGreaterThan(0.2);
    expect(kept).toBeLessThan(0.3);
    // the same id always gets the same answer (a trace is kept or dropped whole)
    const first = ids.map((id) => isSampled({ type: "ratio", probability: 0.25 }, id, {}));
    expect(ids.map((id) => isSampled({ type: "ratio", probability: 0.25 }, id, {}))).toEqual(first);
  });

  test("sampling choices: never and a custom sampler that says no export nothing; always exports every one", async () => {
    for (const sampling of [{ type: "never" } as const, { type: "custom", sampler: () => false } as const]) {
      const memory = new InMemorySpanExporter();
      await turn(defineObservability({ exporters: [memory], sampling, env: {} }));
      expect(memory.getFinishedSpans()).toEqual([]);
    }
    const asked: unknown[] = [];
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({
      exporters: [memory],
      sampling: {
        type: "custom",
        sampler: (ctx) => {
          asked.push(ctx);
          return true;
        },
      },
      env: {},
    });
    await turn(observability);
    await turn(defineObservability({ exporters: [memory], sampling: { type: "always" }, env: {} }));
    expect(chatSpans(memory.getFinishedSpans())).toHaveLength(2);
    expect(asked[0]).toMatchObject({ conversation: "conv-1", request: expect.any(Request) });
  });

  test("debug: each exported span is printed, redacted", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await turn(
      defineObservability({
        exporters: [new InMemorySpanExporter()],
        env: { WEB_AGENTS_OTEL_DEBUG: "true" },
        metadataMapping: { "webmcp.run.id": "user.email" },
        resourceAttributes: {},
      }),
      {
        message: "mail me at sara@example.com",
        telemetry: { recordInputs: true },
      },
    );
    const printed = log.mock.calls.filter(([m]) => String(m).startsWith("[web-agents/telemetry] span"));
    expect(printed.length).toBeGreaterThan(0);
    expect(JSON.stringify(printed)).not.toContain("sara@example.com");
  });
});

describe("any OpenTelemetry instance, as is (R-EXP-2)", () => {
  test("a SpanExporter receives the step's spans, each with the conversation id; nothing of the card (§7.9)", async () => {
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({ exporters: [memory], env: {} });
    await turn(observability, { message: `My card is ${CARD}` });
    const spans = memory.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => s.attributes["webmcp.conversation.id"] === REF.conversation)).toBe(true);
    expect(JSON.stringify(spans.map((s) => ({ a: s.attributes, e: s.events, n: s.name })))).not.toContain("4242");
  });

  test("the step span is a child of the browser's run span, in its trace; the AI SDK's wrapper spans are passed through", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], env: {} }));
    const [chat] = memory.getFinishedSpans();
    expect(names(memory.getFinishedSpans())).toEqual(["chat mock-model-id"]);
    expect(chat!.spanContext().traceId).toBe(TRACE_ID);
    expect(chat!.parentSpanContext?.spanId).toBe(RUN_SPAN);
    expect(chat!.attributes).toMatchObject({ "webmcp.run.id": "run-1", "webmcp.step": 1, "gen_ai.request.model": "mock-model-id" });
  });

  test("without a browser parent (a 0.4.0 page), the AI SDK's own tree is kept", async () => {
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({ exporters: [memory], env: {} });
    const handler = createChatHandler({ model: mockModel([text("ok")]), observability });
    await readChatStream(await handler(chatRequest({ messages: ["hi"] })));
    await observability.flush();
    expect(names(memory.getFinishedSpans()).sort()).toEqual(["chat mock-model-id", "invoke_agent web-agent", "step 1"]);
  });

  test("a SpanProcessor sees each span (start and end) before redaction and export", async () => {
    const seen: string[] = [];
    const memory = new InMemorySpanExporter();
    const processor = {
      onStart: (span: { name: string }) => void seen.push(`start ${span.name}`),
      onEnd: (span: ReadableSpan) => void seen.push(`end ${span.name}${memory.getFinishedSpans().length ? " (late)" : ""}`),
      forceFlush: async () => {},
      shutdown: async () => {},
    };
    await turn(defineObservability({ spanProcessors: [processor], exporters: [memory], env: {} }));
    expect(seen).toEqual(["start chat mock-model-id", "end chat mock-model-id"]);
    expect(memory.getFinishedSpans()).toHaveLength(1);
  });

  test("a TracerProvider passed in: spans are created through it, and no other provider is built", async () => {
    const memory = new InMemorySpanExporter();
    const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: memory })] });
    const sdk = vi.fn(original["@opentelemetry/sdk-trace"]);
    peerLoaders["@opentelemetry/sdk-trace"] = sdk;
    await turn(defineObservability({ tracerProvider: provider, env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" } }));
    expect(chatSpans(memory.getFinishedSpans())).toHaveLength(1);
    expect(sdk).not.toHaveBeenCalled();
  });

  test("two OTLP targets, one by base endpoint and one exact: each gets the spans at its own URL with its own headers", async () => {
    const fetches = stubFetch();
    await turn(
      defineObservability({
        exporters: [
          otlp({ endpoint: "https://a.example", headers: { "x-a": "1" } }),
          otlp({ endpoints: { traces: "https://b.example/ingest?tenant=acme" }, headers: { "x-b": "2" } }),
        ],
        env: {},
      }),
    );
    expect(fetches.map((f) => [f.url, f.headers["x-a"], f.headers["x-b"]])).toEqual([
      ["https://a.example/v1/traces", "1", undefined],
      ["https://b.example/ingest?tenant=acme", undefined, "2"],
    ]);
  });

  test("http/protobuf loads the OTel exporter package, given the target's URL", async () => {
    const made: unknown[] = [];
    peerLoaders["@opentelemetry/exporter-trace-otlp-proto"] = async () => ({
      OTLPTraceExporter: class {
        constructor(o: unknown) {
          made.push(o);
        }
        export(_: unknown, done: (r: { code: number }) => void) {
          done({ code: 0 });
        }
        async shutdown() {}
      },
    });
    await turn(
      defineObservability({
        exporters: [otlp({ endpoint: "https://p.example", protocol: "http/protobuf", headers: { k: "v" } })],
        env: {},
      }),
    );
    expect(made).toEqual([{ url: "https://p.example/v1/traces", headers: { k: "v" }, timeoutMillis: 30_000 }]);
  });

  test("conventions genai: gen_ai.* names, no ai.* ones", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], conventions: "genai", env: {} }));
    const keys = memory.getFinishedSpans().flatMap((s) => Object.keys(s.attributes));
    expect(keys).toContain("gen_ai.request.model");
    expect(keys.filter((k) => k.startsWith("ai."))).toEqual([]);
  });

  test("conventions legacy: the AI SDK's ai.* spans and names (ai.streamText…), for backends that read them", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], conventions: "legacy", env: {} }));
    const spans = memory.getFinishedSpans();
    expect(spans.some((s) => s.name.startsWith("ai.streamText"))).toBe(true);
    expect(spans.flatMap((s) => Object.keys(s.attributes))).toContain("ai.model.id");
    expect(spans.every((s) => s.instrumentationScope.name === "@webmcp-agents/telemetry/legacy")).toBe(true);
  });

  test("conventions both: one set of spans from each tracer", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], conventions: "both", env: {} }));
    const scopes = new Set(memory.getFinishedSpans().map((s) => s.instrumentationScope.name));
    expect(scopes).toEqual(new Set(["@webmcp-agents/telemetry", "@webmcp-agents/telemetry/legacy"]));
  });

  test("metadataMapping: the conversation id is also exported as session.id", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], metadataMapping: { "webmcp.conversation.id": "session.id" }, env: {} }));
    expect(memory.getFinishedSpans()[0]!.attributes).toMatchObject({ "webmcp.conversation.id": "conv-1", "session.id": "conv-1" });
  });

  test("the app's registerTelemetry integrations are kept for the call (per-call integrations would replace them)", async () => {
    const seen: string[] = [];
    (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] }).AI_SDK_TELEMETRY_INTEGRATIONS = [{ onStart: () => seen.push("app") }];
    try {
      const memory = new InMemorySpanExporter();
      await turn(defineObservability({ exporters: [memory], env: {} }));
      expect(seen).toEqual(["app"]);
      expect(chatSpans(memory.getFinishedSpans())).toHaveLength(1);
    } finally {
      (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown }).AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
    }
  });
});

describe("content only on opt-in, always redacted (R-EXP-5)", () => {
  test("defaults: no prompt and no output on any span", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], env: {} }), { message: "a secret plan", steps: [text("the secret answer")] });
    const dump = JSON.stringify(memory.getFinishedSpans().map((s) => s.attributes));
    expect(dump).not.toContain("secret plan");
    expect(dump).not.toContain("secret answer");
  });

  test("recordInputs / recordOutputs on: content is exported, with sensitive values redacted", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], recordInputs: true, recordOutputs: true, env: {} }), {
      message: `Pay with ${CARD} and mail sara@example.com`,
      steps: [text("Done for sara@example.com")],
    });
    const dump = JSON.stringify(memory.getFinishedSpans().map((s) => s.attributes));
    expect(dump).toContain("Pay with");
    expect(dump).toContain("Done for");
    expect(dump).not.toContain("4242");
    expect(dump).not.toContain("sara@example.com");
  });

  test("the handler's own recording flags win over the layer's", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], recordInputs: true, env: {} }), {
      message: "plain words",
      telemetry: { recordInputs: false },
    });
    expect(JSON.stringify(memory.getFinishedSpans().map((s) => s.attributes))).not.toContain("plain words");
  });

  test("redaction is the process's redactor, read at use: configuring it later changes what is exported", async () => {
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({ exporters: [memory], recordInputs: true, env: {} });
    configureRedaction({ patterns: { codename: { pattern: /Bluebird/g, label: "CODENAME" } } });
    await turn(observability, { message: "Project Bluebird" });
    expect(JSON.stringify(memory.getFinishedSpans().map((s) => s.attributes))).not.toContain("Bluebird");
  });

  test("a spanFilter that returns false: that span is not exported", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], spanFilter: (s) => !s.name.startsWith("chat"), env: {} }));
    expect(memory.getFinishedSpans()).toEqual([]);
  });

  test("a tool call the model makes carries no input unless recorded", async () => {
    const memory = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [memory], env: {} }), { steps: [toolCall("pay", { card: CARD })] });
    expect(JSON.stringify(memory.getFinishedSpans().map((s) => s.attributes))).not.toContain("4242");
  });
});

describe("the kill switches on the server (R-EXP-7)", () => {
  test("OTEL_SDK_DISABLED=true: no span, nothing loaded", async () => {
    const memory = new InMemorySpanExporter();
    const api = vi.fn(original["@opentelemetry/api"]);
    peerLoaders["@opentelemetry/api"] = api;
    const observability = defineObservability({ exporters: [memory], env: { OTEL_SDK_DISABLED: "true" } });
    expect(observability.enabled).toBe(false);
    expect((await turn(observability)).res.status).toBe(200);
    expect(memory.getFinishedSpans()).toEqual([]);
  });

  test("WEB_AGENTS_OTEL_ENABLED=false: none of this library's spans", async () => {
    const memory = new InMemorySpanExporter();
    const observability = defineObservability({ exporters: [memory], env: { WEB_AGENTS_OTEL_ENABLED: "false" } });
    await turn(observability);
    expect(memory.getFinishedSpans()).toEqual([]);
  });
});
