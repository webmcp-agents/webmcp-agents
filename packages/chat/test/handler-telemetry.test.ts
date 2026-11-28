/**
 * The handler's run telemetry (R-RUN-1 wire checks, R-RUN-3, R-RUN-4 on the server): ids on the wire, the AI SDK
 * settings it passes per call, refusals reported without content, the observability layer and its flush. Failure
 * paths first.
 */
import { expect, test } from "@webmcp-agents/testing";
import { chatRequest, mockModel, readChatStream, text, toolCall, withSession } from "@webmcp-agents/testing/server";
import { registerTelemetry, type Telemetry } from "ai";
import { afterEach, describe, vi } from "vitest";
import { defineWebAgent } from "../src/agent";
import { createChatHandler } from "../src/server/handler";
import { chatRequestSchema } from "../src/server/validate";
import type { ChatObservability, ChatRefusal } from "../src/server/telemetry";

const TRACE = { conversation: "c0ffee-conversation", run: "run-1", step: 1 };
const PARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
const CARD = "4242 4242 4242 4242";
const SECRET = "my secret message";

/** A telemetry integration that keeps every event it is given, as an exporter would see them. */
function recordingIntegration(): Telemetry & { events: { hook: string; event: unknown }[] } {
  const events: { hook: string; event: unknown }[] = [];
  const keep = (hook: string) => (event: unknown) => void events.push({ hook, event });
  return {
    events,
    onStart: keep("onStart"),
    onStepStart: keep("onStepStart"),
    onLanguageModelCallStart: keep("onLanguageModelCallStart"),
    onLanguageModelCallEnd: keep("onLanguageModelCallEnd"),
    onStepEnd: keep("onStepEnd"),
    onStepFinish: keep("onStepFinish"),
    onStepError: keep("onStepError"),
  } as Telemetry & { events: { hook: string; event: unknown }[] };
}

/** A layer that records what the handler did with it; each method replaceable to make it fail. */
function fakeLayer(overrides: Partial<ChatObservability> = {}) {
  const integration = recordingIntegration();
  const calls: string[] = [];
  const refusals: ChatRefusal[] = [];
  const layer: ChatObservability & { calls: string[]; refusals: ChatRefusal[]; integration: typeof integration } = {
    calls,
    refusals,
    integration,
    telemetry: (ctx) => {
      calls.push(`telemetry:${ctx.trace?.run ?? "-"}:${ctx.traceparent ?? "-"}`);
      return { integrations: [integration] };
    },
    withContext: async (req, run) => {
      calls.push(`withContext:${req.headers.get("traceparent") ?? "-"}`);
      return run();
    },
    refused: (info) => void refusals.push(info),
    flush: async () => {
      calls.push("flush");
    },
    ...overrides,
  };
  return layer;
}

/** The parts of a body, or `[]`. */
const drain = async (res: Response): Promise<void> => {
  await res.text();
};

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: unknown }).AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
});

describe("ids on the wire (R-RUN-1)", () => {
  test.each([
    ["an id longer than 64 characters", { ...TRACE, run: "r".repeat(65) }],
    ["an id with a character outside letters, digits, _ . -", { ...TRACE, conversation: "c/1" }],
    ["a step of 0", { ...TRACE, step: 0 }],
    ["a step of 65", { ...TRACE, step: 65 }],
    ["a step that is not an integer", { ...TRACE, step: 1.5 }],
    ["a parent id with a space", { ...TRACE, parent: "call 1" }],
  ])("%s is a 400 and no model call", async (_, trace) => {
    const model = mockModel([]);
    const onRefused = vi.fn();
    const res = await createChatHandler({ model, telemetry: { onRefused } })(chatRequest({ messages: ["hi"], trace }));
    expect(res.status).toBe(400);
    expect(model.calls).toHaveLength(0);
    expect(onRefused).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, error: "bad_request", reason: "invalid_trace" }),
      expect.any(Request),
    );
  });

  test("a malformed traceparent is ignored: the request is served, and the layer sees no trace context", async () => {
    const layer = fakeLayer();
    const handler = createChatHandler({ model: mockModel([text("Hi.")]), observability: layer });
    for (const header of [
      "garbage",
      "00-00000000000000000000000000000000-b7ad6b7169203331-01",
      "01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    ]) {
      const res = await handler(chatRequest({ messages: ["hi"], trace: TRACE }, { headers: { traceparent: header } }));
      expect(res.status).toBe(200);
      await drain(res);
    }
    expect(layer.calls.filter((c) => c.startsWith("telemetry"))).toEqual(["telemetry:run-1:-", "telemetry:run-1:-", "telemetry:run-1:-"]);
  });

  test("a valid traceparent reaches the layer's context, and the request runs inside its withContext", async () => {
    const layer = fakeLayer();
    const res = await createChatHandler({ model: mockModel([text("Hi.")]), observability: layer })(
      chatRequest({ messages: ["hi"], trace: TRACE }, { headers: { traceparent: PARENT } }),
    );
    await drain(res);
    expect(layer.calls.slice(0, 2)).toEqual([`withContext:${PARENT}`, `telemetry:run-1:${PARENT}`]);
  });
});

describe("R-RUN-3: ids on every step, no content by default", () => {
  test("defaults: an integration the app registered gets the ids and never the prompt (a card number in it appears nowhere)", async () => {
    const integration = recordingIntegration();
    registerTelemetry(integration);
    const agent = defineWebAgent({ id: "store", instructions: "Sell mugs." });
    const handler = createChatHandler({ model: mockModel([text("Done.")]), agents: [agent] });
    const res = await handler(chatRequest({ messages: [`Pay with ${CARD}`], agent: "store", trace: { ...TRACE, parent: "call-9" } }));
    await drain(res);
    expect(integration.events.length).toBeGreaterThan(0);
    const recorded = JSON.stringify(integration.events);
    expect(recorded).not.toContain("4242");
    expect(integration.events).not.toContainSensitive([CARD, "Sell mugs"]);
    const start = integration.events.find((e) => e.hook === "onStart")!.event as {
      runtimeContext?: Record<string, unknown>;
      functionId?: string;
    };
    expect(start.runtimeContext).toEqual({
      "webmcp.conversation.id": TRACE.conversation,
      "webmcp.run.id": "run-1",
      "webmcp.step": 1,
      "webmcp.parent.call.id": "call-9",
      "webmcp.agent.id": "store",
    });
    expect(recorded).toContain("web-agent.store");
  });

  test("opting in records prompts and output (the layer still redacts them)", async () => {
    const layer = fakeLayer();
    const handler = createChatHandler({
      model: mockModel([text("The answer is 42.")]),
      observability: layer,
      telemetry: { recordInputs: true, recordOutputs: true },
    });
    await drain(await handler(chatRequest({ messages: [SECRET], trace: TRACE })));
    const recorded = JSON.stringify(layer.integration.events);
    expect(recorded).toContain(SECRET);
    expect(recorded).toContain("The answer is 42.");
  });

  test("the layer's own recording flags apply when the handler sets none; the handler's win when it does", async () => {
    let seen: unknown;
    const prepareAgent = vi.fn((s) => {
      seen = s.telemetry;
      return s;
    });
    const layer = fakeLayer({ telemetry: () => ({ recordInputs: true, isEnabled: true }) });
    await drain(
      await createChatHandler({ model: mockModel([text("x")]), observability: layer, prepareAgent })(chatRequest({ messages: ["hi"] })),
    );
    expect(seen).toMatchObject({ recordInputs: true, recordOutputs: false, isEnabled: true });
    await drain(
      await createChatHandler({ model: mockModel([text("x")]), observability: layer, prepareAgent, telemetry: { recordInputs: false } })(
        chatRequest({ messages: ["hi"] }),
      ),
    );
    expect(seen).toMatchObject({ recordInputs: false });
  });

  test("how traces are grouped: web-agent.<agent>, web-agent without one, or the app's functionId", async () => {
    const ids: string[] = [];
    const prepareAgent = (s: { telemetry?: { functionId?: string } }) => {
      ids.push(String(s.telemetry?.functionId));
      return s as never;
    };
    const store = defineWebAgent({ id: "store", instructions: "x" });
    const handler = createChatHandler({ model: mockModel([text("x")]), agents: [store], prepareAgent });
    await drain(await handler(chatRequest({ messages: ["hi"], agent: "store" })));
    await drain(await handler(chatRequest({ messages: ["hi"] })));
    const named = createChatHandler({
      model: mockModel([text("x")]),
      prepareAgent,
      telemetry: { functionId: (a) => `shop.${a?.id ?? "assistant"}` },
    });
    await drain(await named(chatRequest({ messages: ["hi"] })));
    expect(ids).toEqual(["web-agent.store", "web-agent", "shop.assistant"]);
  });

  test("hooks see the ids: prepareAgent and beforeModel get the request's trace and session", async () => {
    const beforeModel = vi.fn(() => undefined);
    const prepareAgent = vi.fn((s) => s);
    const handler = await withSession(
      createChatHandler({
        model: mockModel([text("x")]),
        session: true,
        env: { WEB_AGENTS_SESSION_SECRET: "s".repeat(40) },
        beforeModel,
        prepareAgent,
      }),
    );
    await drain(await handler(chatRequest({ messages: ["hi"], trace: TRACE })));
    const session = expect.stringMatching(/^[\w-]{10,}$/);
    expect(beforeModel).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ trace: TRACE, session }));
    expect(prepareAgent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ trace: TRACE, session, request: expect.any(Request) }),
    );
  });

  test("app metadata becomes attributes; values that are not attributes are dropped", async () => {
    let context: unknown;
    const prepareAgent = (s: { runtimeContext?: unknown }) => {
      context = s.runtimeContext;
      return s as never;
    };
    const metadata = vi.fn(async () => ({ "user.id": "u1", nested: { no: 1 } as never, "webmcp.run.id": "spoofed" }));
    await drain(
      await createChatHandler({ model: mockModel([text("x")]), prepareAgent, telemetry: { metadata } })(
        chatRequest({ messages: ["hi"], trace: TRACE }),
      ),
    );
    expect(metadata).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ trace: TRACE }));
    // the ids win over a key the app reuses
    expect(context).toEqual(expect.objectContaining({ "user.id": "u1", "webmcp.run.id": "run-1" }));
    expect(context).not.toHaveProperty("nested");
  });

  test.each([
    [
      "throws",
      () => {
        throw new Error("db down");
      },
    ],
    ["rejects", () => Promise.reject(new Error("db down"))],
  ])("metadata that %s: served without it, logged once", async (_, metadata) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createChatHandler({ model: mockModel([text("x")]), telemetry: { metadata } });
    for (let i = 0; i < 2; i++) {
      const res = await handler(chatRequest({ messages: ["hi"] }));
      expect(res.status).toBe(200);
      await drain(res);
    }
    expect(errors.mock.calls.filter(([line]) => String(line).includes("telemetry.metadata"))).toHaveLength(1);
  });

  test("telemetry: false passes no telemetry setting and sends no usage; ids are still accepted", async () => {
    let settings: Record<string, unknown> = {};
    const prepareAgent = (s: Record<string, unknown>) => {
      settings = s;
      return s as never;
    };
    const res = await createChatHandler({ model: mockModel([text("x")]), telemetry: false, prepareAgent })(
      chatRequest({ messages: ["hi"], trace: TRACE }),
    );
    expect(res.status).toBe(200);
    const parts = await readChatStream(res);
    expect(settings).not.toHaveProperty("telemetry");
    expect(settings).not.toHaveProperty("runtimeContext");
    expect(parts.find((p) => p.type === "finish")?.chunk).not.toHaveProperty("messageMetadata");
  });
});

describe("usage back to the browser (R-RUN-2's wire half)", () => {
  test("the finish chunk carries the step's usage and the model id", async () => {
    const res = await createChatHandler({
      model: mockModel([text("x", { usage: { inputTokens: 120, outputTokens: 9, cachedInputTokens: 100 } })]),
    })(chatRequest({ messages: ["hi"] }));
    const finish = (await readChatStream(res)).find((p) => p.type === "finish")!;
    expect(finish.chunk.messageMetadata).toEqual({
      usage: { inputTokens: 120, outputTokens: 9, totalTokens: 129, reasoningTokens: 0, cachedInputTokens: 100 },
      model: expect.any(String),
    });
  });

  test("usageToClient: false keeps usage on the server", async () => {
    const res = await createChatHandler({ model: mockModel([text("x")]), telemetry: { usageToClient: false } })(
      chatRequest({ messages: ["hi"] }),
    );
    const finish = (await readChatStream(res)).find((p) => p.type === "finish")!;
    expect(finish.chunk).not.toHaveProperty("messageMetadata");
  });
});

describe("refusals reach onRefused without content (R-RUN-3)", () => {
  const body = { messages: [SECRET], trace: TRACE };
  const env = { WEB_AGENTS_SESSION_SECRET: "s".repeat(40) };
  async function refusal(
    options: Parameters<typeof createChatHandler>[0],
    req: Request,
  ): Promise<{ res: Response; info: ChatRefusal; layer: ChatRefusal[] }> {
    const onRefused = vi.fn();
    const layer = fakeLayer();
    const res = await createChatHandler({
      model: mockModel([]),
      ...options,
      observability: layer,
      telemetry: { ...(options?.telemetry as object), onRefused },
    })(req);
    expect(onRefused).toHaveBeenCalledOnce();
    const info = onRefused.mock.calls[0]![0] as ChatRefusal;
    // never content: not the message, not the body
    expect(JSON.stringify(info)).not.toContain("secret");
    expect(layer.refusals).toEqual([info]);
    return { res, info, layer: layer.refusals };
  }

  const post = (extra: Record<string, unknown> = {}, init: Parameters<typeof chatRequest>[1] = {}) =>
    chatRequest({ ...body, ...extra }, init);

  test("a cross-site request", async () => {
    const { info } = await refusal({}, post({}, { origin: "https://evil.example" }));
    expect(info).toEqual({ status: 403, error: "forbidden" });
  });

  test("a method other than GET / POST", async () => {
    const { info } = await refusal({}, new Request("http://localhost/api/chat", { method: "PUT" }));
    expect(info).toEqual({ status: 405, error: "method_not_allowed" });
  });

  test("a guard's own response, with its code and reason", async () => {
    const guard = () =>
      new Response(JSON.stringify({ error: "rate_limited", reason: "per_ip" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    const { res, info } = await refusal({ guard }, post());
    expect(res.status).toBe(429);
    expect(info).toEqual({ status: 429, error: "rate_limited", reason: "per_ip" });
  });

  test("a guard's response that is not JSON reads as refused", async () => {
    const { info } = await refusal({ guard: () => new Response("nope", { status: 418 }) }, post());
    expect(info).toEqual({ status: 418, error: "refused" });
  });

  test("chat not configured", async () => {
    const { info } = await refusal({ model: "anthropic/claude-opus-5-5", env: {} }, post());
    expect(info).toEqual({ status: 503, error: "chat_disabled" });
  });

  test("a missing session", async () => {
    const { info } = await refusal({ session: true, env }, post());
    expect(info).toEqual({ status: 401, error: "session_required" });
  });

  test("a body that is not JSON, too large, or with the wrong content type", async () => {
    const notJson = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{${SECRET}`,
    });
    expect((await refusal({}, notJson)).info).toEqual({ status: 400, error: "bad_request", reason: "not_json" });
    const big = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(1024 * 1024 + 1),
    });
    expect((await refusal({}, big)).info).toEqual({ status: 413, error: "bad_request", reason: "body_too_large" });
    const plain = new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "text/plain" }, body: SECRET });
    expect((await refusal({}, plain)).info).toEqual({ status: 415, error: "bad_request", reason: "not_json_content_type" });
  });

  test("validation: the first invalid field's path, and the trace ids when they were valid", async () => {
    const invalid = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: SECRET }] }],
        tools: "nope",
        trace: TRACE,
      }),
    });
    const { info } = await refusal({}, invalid);
    expect(info).toEqual({ status: 400, error: "bad_request", reason: "tools", trace: TRACE });
  });

  test("an unknown agent, and a request without the agent the endpoint requires", async () => {
    expect((await refusal({}, post({ agent: "ghost" }))).info).toEqual({
      status: 400,
      error: "bad_request",
      reason: "unknown_agent",
      trace: TRACE,
    });
    expect((await refusal({ requireAgent: true }, post())).info).toEqual({
      status: 400,
      error: "bad_request",
      reason: "agent_required",
      trace: TRACE,
    });
  });

  test("a budget (beforeModel)", async () => {
    const beforeModel = () =>
      new Response(JSON.stringify({ error: "unavailable", reason: "daily_budget" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    const { info } = await refusal({ beforeModel }, post());
    expect(info).toEqual({ status: 503, error: "unavailable", reason: "daily_budget", trace: TRACE });
  });

  test("a request that fails on the server (a 500)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prepareAgent = () => {
      throw new Error(`boom: ${SECRET}`);
    };
    const { res, info } = await refusal({ model: mockModel([text("x")]), prepareAgent }, post());
    expect(res.status).toBe(500);
    expect(info).toEqual({ status: 500, error: "server_error", trace: TRACE });
  });

  test("a model error mid-stream", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onRefused = vi.fn();
    const failing = mockModel([{ error: { message: `provider echoed ${SECRET}` } }]);
    const res = await createChatHandler({ model: failing, telemetry: { onRefused } })(post());
    expect(res.status).toBe(200);
    await drain(res);
    expect(onRefused).toHaveBeenCalledWith(
      expect.objectContaining({ status: 502, error: "model_error", trace: TRACE }),
      expect.any(Request),
    );
    expect(JSON.stringify(onRefused.mock.calls[0]![0])).not.toContain("secret");
  });

  test("onRefused and the layer's refused may throw: the response is the same, and each is logged once", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRefused = () => {
      throw new Error("analytics down");
    };
    const layer = fakeLayer({
      refused: () => {
        throw new Error("counter down");
      },
    });
    const handler = createChatHandler({ model: mockModel([]), telemetry: { onRefused }, observability: layer });
    for (let i = 0; i < 2; i++) expect((await handler(post({}, { origin: "https://evil.example" }))).status).toBe(403);
    expect(errors.mock.calls.filter(([l]) => /onRefused|refused failed/.test(String(l)))).toHaveLength(2);
  });
});

describe("the observability layer never fails a request", () => {
  test("withContext that throws before running: served once without it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = mockModel([text("x")]);
    const layer = fakeLayer({ withContext: async () => Promise.reject(new Error("no context")) });
    const res = await createChatHandler({ model, observability: layer })(chatRequest({ messages: ["hi"] }));
    expect(res.status).toBe(200);
    await drain(res);
    expect(model.calls).toHaveLength(1);
    expect(errors.mock.calls.some(([l]) => String(l).includes("withContext"))).toBe(true);
  });

  test("withContext that throws after running: the model is never called twice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const model = mockModel([text("x")]);
    const layer = fakeLayer({
      withContext: async (_req, run) => {
        await run();
        throw new Error("context lost");
      },
    });
    const res = await createChatHandler({ model, observability: layer })(chatRequest({ messages: ["hi"] }));
    expect(res.status).toBe(200);
    await drain(res);
    expect(model.calls).toHaveLength(1);
  });

  test("telemetry() that throws: served without the layer's settings", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const layer = fakeLayer({
      telemetry: () => {
        throw new Error("tracer gone");
      },
    });
    const res = await createChatHandler({ model: mockModel([text("x")]), observability: layer })(chatRequest({ messages: ["hi"] }));
    expect(res.status).toBe(200);
    await drain(res);
  });
});

describe("flush after the stream closes", () => {
  test("with the host's waitUntil (a Worker's ctx): handed over after the stream ends, never before", async () => {
    const layer = fakeLayer();
    const waitUntil = vi.fn();
    const res = await createChatHandler({ model: mockModel([text("x")]), observability: layer })(
      chatRequest({ messages: ["hi"] }),
      {},
      { waitUntil },
    );
    expect(waitUntil).not.toHaveBeenCalled();
    await drain(res);
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]![0];
    expect(layer.calls).toContain("flush");
  });

  test("the waitUntil option wins, and a failing flush does not affect the response", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const layer = fakeLayer({ flush: () => Promise.reject(new Error("collector down")) });
    const waitUntil = vi.fn();
    const res = await createChatHandler({ model: mockModel([text("Fine.")]), observability: layer, waitUntil })(
      chatRequest({ messages: ["hi"] }),
    );
    expect(res.status).toBe(200);
    expect((await readChatStream(res)).some((p) => p.type === "text-delta")).toBe(true);
    await waitUntil.mock.calls[0]![0]; // resolves: the failure is logged, never thrown
    expect(errors.mock.calls.some(([l]) => String(l).includes("observability.flush"))).toBe(true);
  });

  test("without waitUntil: a flush that never ends neither delays the stream nor runs past the export timeout", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const flush = vi.fn(() => new Promise<void>(() => {}));
    const layer = fakeLayer({ flush, exportTimeoutMs: 30 });
    const res = await createChatHandler({ model: mockModel([text("x")]), observability: layer })(chatRequest({ messages: ["hi"] }));
    await drain(res); // completes although flush never resolves
    expect(flush).toHaveBeenCalledOnce();
    await expect.poll(() => errors.mock.calls.some(([l]) => String(l).includes("within 30 ms")), { timeout: 5000 }).toBe(true);
  });

  test("a refusal flushes too (the layer counted it)", async () => {
    const waitUntil = vi.fn();
    const layer = fakeLayer();
    await createChatHandler({ model: mockModel([]), observability: layer, waitUntil })(
      chatRequest({ messages: ["hi"] }, { origin: "https://evil.example" }),
    );
    expect(waitUntil).toHaveBeenCalledOnce();
  });
});

describe("R-RUN-4: 0.4.0 and 0.5.0 interoperate", () => {
  test("an old page (no trace) gets 200 from a new handler; the step carries no conversation id and nothing throws", async () => {
    const integration = recordingIntegration();
    registerTelemetry(integration);
    const res = await createChatHandler({ model: mockModel([toolCall("add_to_cart", { qty: 2 })]) })(
      chatRequest({ messages: ["hi"], tools: ["add_to_cart"] }),
    );
    expect(res.status).toBe(200);
    expect((await readChatStream(res)).map((p) => p.type)).toContain("tool-call");
    const start = integration.events.find((e) => e.hook === "onStart")!.event as { runtimeContext?: Record<string, unknown> };
    expect(start.runtimeContext ?? {}).not.toHaveProperty("webmcp.conversation.id");
  });

  test("a new page's body passes a 0.4.0 handler's schema (not strict: `trace` is stripped, no 400)", () => {
    const old = chatRequestSchema.omit({ trace: true }); // 0.4.0's body schema is today's without `trace`
    const body = { messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] }], tools: [], trace: TRACE };
    const parsed = old.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("trace");
  });
});
