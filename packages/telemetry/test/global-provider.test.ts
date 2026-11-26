/**
 * An app's own OpenTelemetry setup (a global tracer provider: Sentry, `@vercel/otel`, the SDK) is used and never
 * replaced, never mistaken for the API's no-op default, and never shut down (design §7.2 rule 3, §7.4 [R3]; open
 * question 9). Failure paths first. (R-EXP-3, R-EXP-5, R-EXP-7)
 */
import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { createChatHandler } from "@webmcp-agents/chat/server";
import { chatRequest, mockModel, readChatStream, text } from "@webmcp-agents/testing/server";
import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";
import { peerLoaders } from "../src/server/peers";
import { defineObservability, type Observability } from "../src/server";

const REF = { conversation: "conv-g", run: "run-g", step: 1 };
const TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const CARD = "4242 4242 4242 4242";

async function turn(observability: Observability, message = "hi") {
  const handler = createChatHandler({ model: mockModel([text("ok")]), observability });
  const res = await handler(chatRequest({ messages: [message], trace: REF }, { headers: { traceparent: TRACEPARENT } }));
  await readChatStream(res);
  await observability.flush();
  return res;
}

/** The app's own setup: an SDK provider registered globally, exporting to memory. */
function registerAppProvider() {
  const memory = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: memory })] });
  const shutdown = vi.spyOn(provider, "shutdown");
  const forceFlush = vi.spyOn(provider, "forceFlush");
  expect(trace.setGlobalTracerProvider(provider)).toBe(true);
  return { memory, provider, shutdown, forceFlush };
}

const original = { ...peerLoaders };
let errors: MockInstance<(...args: unknown[]) => void>;
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  trace.disable();
  Object.assign(peerLoaders, original);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("no provider, or the wrong one (R-EXP-3)", () => {
  test("nothing registered and no endpoint: the API's default proxy is not mistaken for a provider, telemetry is off", async () => {
    // the API always hands out a proxy, registered or not
    expect(trace.getTracerProvider()).toBeDefined();
    const observability = defineObservability({ env: {} });
    expect(observability.enabled).toBe(false);
    expect((await turn(observability)).status).toBe(200);
    expect(observability.enabled).toBe(false);
  });

  test('tracerProvider: "global" with none registered: off, one error saying what to register, the chat works', async () => {
    const observability = defineObservability({ tracerProvider: "global", env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" } });
    for (let i = 0; i < 3; i++) expect((await turn(observability)).status).toBe(200);
    const lines = errors.mock.calls.map(([m]) => String(m)).filter((m) => m.includes('"global"'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/no tracer provider is registered. Register one first/);
  });

  test("a no-op provider registered on purpose is not a provider either", async () => {
    const { ProxyTracerProvider } = await import("@opentelemetry/api");
    trace.setGlobalTracerProvider(new ProxyTracerProvider().getDelegate());
    expect(defineObservability({ env: {} }).enabled).toBe(false);
  });
});

describe("the app's provider is used and never replaced (R-EXP-3)", () => {
  test("with no option, the step's spans reach the app's exporter; the global provider is the same object before and after", async () => {
    const app = registerAppProvider();
    const before = trace.getTracerProvider();
    const observability = defineObservability({ env: {} });
    expect(observability.enabled).toBe(true);
    await turn(observability);
    expect(trace.getTracerProvider()).toBe(before);
    expect(app.memory.getFinishedSpans().map((s) => s.name)).toEqual(["chat mock-model-id"]);
    expect(app.memory.getFinishedSpans()[0]!.attributes["webmcp.conversation.id"]).toBe("conv-g");
    expect(app.forceFlush).toHaveBeenCalled(); // flush reaches through the API's proxy
  });

  test("a global provider wins over the env: the library builds no exporter and loads no SDK", async () => {
    const app = registerAppProvider();
    const sdk = vi.fn(original["@opentelemetry/sdk-trace"]);
    peerLoaders["@opentelemetry/sdk-trace"] = sdk;
    const fetches: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetches.push(url);
      return new Response(null);
    });
    await turn(defineObservability({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" } }));
    expect(app.memory.getFinishedSpans()).toHaveLength(1);
    expect(sdk).not.toHaveBeenCalled();
    expect(fetches).toEqual([]);
  });

  test("exporters given: a private provider gets the spans, the global one none", async () => {
    const app = registerAppProvider();
    const mine = new InMemorySpanExporter();
    await turn(defineObservability({ exporters: [mine], env: {} }));
    expect(mine.getFinishedSpans()).toHaveLength(1);
    expect(app.memory.getFinishedSpans()).toEqual([]);
  });

  test('tracerProvider: "own" with a global provider registered: private, the global one receives none', async () => {
    const app = registerAppProvider();
    const posted: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      posted.push(url);
      return new Response(null);
    });
    await turn(defineObservability({ tracerProvider: "own", env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" } }));
    expect(posted).toEqual(["https://c.example/v1/traces"]);
    expect(app.memory.getFinishedSpans()).toEqual([]);
  });

  test("shutdown() while the app's provider is in use: the app's provider is flushed, never shut down", async () => {
    const app = registerAppProvider();
    const observability = defineObservability({ env: {} });
    await turn(observability);
    await observability.shutdown();
    expect(app.shutdown).not.toHaveBeenCalled();
  });

  test("a provider passed in is the app's too: shutdown() does not shut it down", async () => {
    const memory = new InMemorySpanExporter();
    const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter: memory })] });
    const shutdown = vi.spyOn(provider, "shutdown");
    const observability = defineObservability({ tracerProvider: provider, env: {} });
    await turn(observability);
    await observability.shutdown();
    expect(shutdown).not.toHaveBeenCalled();
    expect(memory.getFinishedSpans()).toHaveLength(1);
  });
});

describe("through the app's provider, what this library sets is redacted before the span exists (R-EXP-5)", () => {
  test("recording on, a card number in the prompt: the attributes the app's processors see carry the redacted form", async () => {
    const seenAtStart: string[] = [];
    const memory = new InMemorySpanExporter();
    const provider = new TracerProvider({
      spanProcessors: [
        {
          onStart: (span: { attributes: object }) => void seenAtStart.push(JSON.stringify(span.attributes)),
          onEnd() {},
          forceFlush: async () => {},
          shutdown: async () => {},
        },
        new SimpleSpanProcessor({ exporter: memory }),
      ],
    });
    trace.setGlobalTracerProvider(provider);
    await turn(defineObservability({ recordInputs: true, env: {} }), `Pay with ${CARD}`);
    const dump = JSON.stringify(memory.getFinishedSpans().map((s) => s.attributes));
    expect(dump).toContain("Pay with");
    expect(dump).not.toContain("4242");
    expect(seenAtStart.join("")).not.toContain("4242");
  });

  test("a spanFilter through the app's provider runs when the span starts: false skips it", async () => {
    const app = registerAppProvider();
    await turn(defineObservability({ spanFilter: () => false, env: {} }));
    expect(app.memory.getFinishedSpans()).toEqual([]);
  });
});

describe("only this library is switched off (R-EXP-7)", () => {
  test("WEB_AGENTS_OTEL_ENABLED=false with the app's own setup: the app's spans are unaffected, none of this library's exist", async () => {
    const app = registerAppProvider();
    const observability = defineObservability({ env: { WEB_AGENTS_OTEL_ENABLED: "false" } });
    await turn(observability);
    trace.getTracer("the-app").startSpan("GET /checkout").end();
    expect(app.memory.getFinishedSpans().map((s) => s.name)).toEqual(["GET /checkout"]);
  });

  test("OTEL_SDK_DISABLED=true: no span through the app's provider either", async () => {
    const app = registerAppProvider();
    await turn(defineObservability({ env: { OTEL_SDK_DISABLED: "true" } }));
    expect(app.memory.getFinishedSpans()).toEqual([]);
  });
});

describe("the app's own @ai-sdk/otel integration and this layer's are not both recorded (one chat span per step)", () => {
  /** The app's `registerTelemetry(new OpenTelemetry())`, undone after `run`. */
  async function withAppIntegration(run: () => Promise<void>) {
    const { OpenTelemetry } = await import("@ai-sdk/otel");
    const g = globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown[] };
    g.AI_SDK_TELEMETRY_INTEGRATIONS = [new OpenTelemetry()];
    try {
      await run();
    } finally {
      g.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
    }
  }
  const chats = (spans: readonly { name: string }[]) => spans.filter((s) => s.name.startsWith("chat ")).map((s) => s.name);

  test("global mode: the app's is left out of the call, logged once; only this layer's spans exist", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const app = registerAppProvider();
    await withAppIntegration(async () => {
      const observability = defineObservability({ env: {} });
      await turn(observability);
      await turn(observability);
    });
    const spans = app.memory.getFinishedSpans();
    expect(chats(spans)).toEqual(["chat mock-model-id", "chat mock-model-id"]);
    expect(spans.every((s) => s.instrumentationScope.name === "@webmcp-agents/telemetry")).toBe(true);
    expect(info.mock.calls.filter(([m]) => String(m).includes("@ai-sdk/otel integration was left out"))).toHaveLength(1);
  });

  test("a provider passed in that is the registered one counts as the same provider", async () => {
    const app = registerAppProvider();
    await withAppIntegration(() => turn(defineObservability({ tracerProvider: app.provider, env: {} })).then(() => {}));
    expect(chats(app.memory.getFinishedSpans())).toEqual(["chat mock-model-id"]);
  });

  test('appIntegrations: "keep": both record (the previous behaviour)', async () => {
    const app = registerAppProvider();
    await withAppIntegration(() => turn(defineObservability({ appIntegrations: "keep", env: {} })).then(() => {}));
    const scopes = new Set(app.memory.getFinishedSpans().map((s) => s.instrumentationScope.name));
    expect(scopes.size).toBeGreaterThan(1);
    expect(chats(app.memory.getFinishedSpans()).length).toBeGreaterThan(1);
  });

  test("private mode (exporters given): the app's integration is kept, its spans go to the app's provider", async () => {
    const app = registerAppProvider();
    const mine = new InMemorySpanExporter();
    await withAppIntegration(() => turn(defineObservability({ exporters: [mine], env: {} })).then(() => {}));
    expect(chats(mine.getFinishedSpans())).toEqual(["chat mock-model-id"]);
    expect(app.memory.getFinishedSpans().length).toBeGreaterThan(0);
    expect(app.memory.getFinishedSpans().some((s) => s.instrumentationScope.name === "@webmcp-agents/telemetry")).toBe(false);
  });

  test("a request this layer does not sample: the app's integration is kept (it is the only one recording)", async () => {
    const app = registerAppProvider();
    await withAppIntegration(() => turn(defineObservability({ sampling: { type: "never" }, env: {} })).then(() => {}));
    const spans = app.memory.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.some((s) => s.instrumentationScope.name === "@webmcp-agents/telemetry")).toBe(false);
  });
});
