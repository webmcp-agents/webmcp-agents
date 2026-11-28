/**
 * Errors travel as codes (design §5.3, the table; R-CHAT-1 "errors arrive as codes", "server-only codes", "callers
 * that are not the UI", "text meant for the model"). One test per row, then the 0.4.0 server, then the handler.
 */
import { describe, expect, it, vi } from "vitest";
import { createCloudAdapter } from "../src/adapter/cloud";
import { defineWebAgent } from "../src/agent";
import { en } from "../src/customize/en";
import { CHAT_ERROR_CODES, chatErrorCode } from "../src/customize/errors";
import { createTranslator } from "../src/customize/translate";
import { createChatHandler } from "../src/server/handler";
import { serverMessages } from "../src/server/messages";
import { sessionReducer } from "../src/session/reducer";
import { invokeAgent, runAgent } from "../src/session/run-agent";
import type { AgentAdapter, AgentMessage, AgentStreamPart } from "../src/types";
import { mockModel } from "@webmcp-agents/testing/server";

const user: AgentMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Add a mug" }] };

/** The first part a cloud adapter yields when the endpoint answers `status` with `body`. */
async function refused(status: number, body: unknown, headers: Record<string, string> = {}): Promise<AgentStreamPart> {
  const adapter = createCloudAdapter({ fetch: async () => new Response(JSON.stringify(body), { status, headers }) });
  for await (const p of adapter.run({ messages: [user], tools: [], signal: new AbortController().signal, callTool: vi.fn() }))
    if (p.type !== "step-start") return p; // the step marker comes first (0.5.0): the refusal is the part after it
  throw new Error("no part");
}

describe("the table: each failure has its code, and the English text for callers that are not the UI", () => {
  it.each([
    ["401 session_required", 401, { error: "session_required" }, {}, "session"],
    ["503 with reason daily_budget", 503, { error: "unavailable", reason: "daily_budget" }, {}, "daily_limit"],
    ["429 with retry-after over an hour", 429, { error: "rate_limited" }, { "retry-after": "7200" }, "daily_limit"],
    ["503 that is not chat_disabled", 503, { error: "unavailable" }, {}, "busy"],
    ["503 chat_disabled", 503, { error: "chat_disabled" }, {}, "chat_disabled"],
    ["429", 429, { error: "rate_limited" }, { "retry-after": "30" }, "rate_limited"],
    ["400 / 413 / 415", 413, { error: "bad_request" }, {}, "bad_request"],
    ["any other status", 500, { error: "server_error", message: "The assistant had a problem answering." }, {}, "unknown"],
    ["a status nobody planned for", 418, null, {}, "unknown"],
  ] as const)("%s → %s", async (_row, status, body, headers, code) => {
    const part = await refused(status, body, headers);
    expect(part).toEqual({ type: "error", code, error: en.errors[code] });
  });

  it("a network failure → network", async () => {
    const adapter = createCloudAdapter({
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const parts: AgentStreamPart[] = [];
    for await (const p of adapter.run({ messages: [user], tools: [], signal: new AbortController().signal, callTool: vi.fn() }))
      parts.push(p);
    expect(parts).toEqual([
      { type: "step-start", step: 1 },
      { type: "error", code: "network", error: en.errors.network },
    ]);
  });

  it("the adapter's unavailable status carries a code too (the chat words it)", async () => {
    vi.stubGlobal("window", {});
    const adapter = createCloudAdapter({ fetch: async () => new Response(JSON.stringify({ enabled: false }), { status: 200 }) });
    const changed = new Promise<void>((r) => adapter.subscribe!(r));
    adapter.status!();
    await changed;
    expect(adapter.status!()).toEqual({ state: "unavailable", reason: en.errors.chat_disabled, code: "chat_disabled" });
    vi.unstubAllGlobals();
  });

  it("a run whose adapter throws → run_failed; an aborted run → aborted (runAgent, agent.invoke, useWebAgent)", async () => {
    const throws: AgentAdapter = {
      id: "t",
      label: "T",
      // biome-ignore lint/correctness/useYield: it fails before its first part
      async *run() {
        throw new Error("the model provider fell over");
      },
    };
    const run = await runAgent({ adapter: throws, messages: [user], signal: new AbortController().signal, listTools: async () => [] });
    expect(run).toMatchObject({ reason: "error", code: "run_failed", error: "the model provider fell over" });

    const ctrl = new AbortController();
    ctrl.abort();
    const aborted = await runAgent({ adapter: throws, messages: [user], signal: ctrl.signal, listTools: async () => [] });
    expect(aborted).toMatchObject({ reason: "aborted", code: "aborted" });

    // agent.invoke: an Error with the code and the English text
    const agent = defineWebAgent({ id: "shopper", instructions: "Shop." });
    const err = await invokeAgent(agent, "Add a mug", { adapter: throws }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ message: "the model provider fell over", code: "run_failed" });
    // an adapter error part keeps its code and text
    const failing: AgentAdapter = {
      id: "f",
      label: "F",
      async *run() {
        yield { type: "error", error: en.errors.rate_limited, code: "rate_limited" };
      },
    };
    await expect(invokeAgent(agent, "Add a mug", { adapter: failing })).rejects.toMatchObject({
      code: "rate_limited",
      message: en.errors.rate_limited,
    });
  });

  it("the step limit → max_steps, the one new visible message: an error the person can retry", () => {
    const state = sessionReducer(
      { messages: [user], status: "streaming" },
      { type: "part", part: { type: "finish", reason: "max-steps" } },
    );
    expect(state.status).toBe("error");
    expect(state.error).toEqual({ message: en.errors.max_steps, code: "max_steps" });
    // a normal finish is not an error
    expect(
      sessionReducer({ messages: [user], status: "streaming" }, { type: "part", part: { type: "finish", reason: "stop" } }).status,
    ).toBe("idle");
  });
});

describe("what the person reads", () => {
  it("every code is a catalog key with text, in each catalog", () => {
    const t = createTranslator();
    for (const code of CHAT_ERROR_CODES) expect(t(`errors.${code}`), code).toBe(en.errors[code]);
  });

  it("server-only codes read as unknown or busy, and are not catalog keys (R-CHAT-1: server-only codes)", () => {
    expect(chatErrorCode("forbidden")).toBe("unknown");
    expect(chatErrorCode("method_not_allowed")).toBe("unknown");
    expect(chatErrorCode("server_error")).toBe("unknown");
    expect(chatErrorCode("forbidden_origin")).toBe("unknown");
    expect(chatErrorCode("unavailable")).toBe("busy");
    for (const code of ["forbidden", "method_not_allowed", "server_error", "forbidden_origin", "unavailable"])
      expect(Object.keys(en.errors)).not.toContain(code);
  });

  it("an unrecognized failure is unknown: no code, a made-up one, not a string", () => {
    expect(chatErrorCode(undefined)).toBe("unknown");
    expect(chatErrorCode("nope")).toBe("unknown");
    expect(chatErrorCode(42)).toBe("unknown");
  });

  it("a 0.4.0 server (fewer codes, English only) still gets translated text: the page derives the code", async () => {
    // what a 0.4.0 handler answered: no `reason`, only its English message
    const part = await refused(503, { error: "unavailable", message: "The assistant is busy." });
    expect(part).toMatchObject({ code: "busy" });
    const es = createTranslator({ errors: { busy: "El asistente está ocupado." } }, "es");
    expect(es(`errors.${chatErrorCode((part as { code?: string }).code)}`)).toBe("El asistente está ocupado.");
    // a 0.4.0 adapter's error part with no code at all
    expect(es(`errors.${chatErrorCode(undefined)}`)).toBe(en.errors.unknown);
  });
});

describe("text meant for the model: createChatHandler({ messages }) (R-CHAT-1)", () => {
  it("the tool-budget note is the app's", async () => {
    const model = mockModel([{ text: "Summary" }]);
    const step: AgentMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "tool", id: "c1", name: "x", input: {}, state: "done", output: { content: [{ type: "text", text: "ok" }] } }],
    };
    const handler = createChatHandler({ model, maxSteps: 1, messages: { toolBudget: "Presupuesto agotado: resume sin herramientas." } });
    const res = await handler(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [user, step], tools: [] }),
      }),
    );
    await res.text();
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).toContain("Presupuesto agotado: resume sin herramientas.");
  });

  it("a 500's message is the app's serverError", async () => {
    const handler = createChatHandler({
      model: mockModel([{ text: "x" }]),
      prepareAgent: () => {
        throw new Error("boom");
      },
      messages: { serverError: "Error del servidor." },
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handler(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [user], tools: [] }),
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_error", message: "Error del servidor." });
    error.mockRestore();
  });

  it("the not-on-page result: a template, a function, and English when a function throws", () => {
    expect(serverMessages().notOnPage("pay")).toMatch(/^Error \[unavailable\]: Tool "pay" is not on this page/);
    expect(serverMessages({ notOnPage: "Error [unavailable]: {tool} no está en esta página." }).notOnPage("pay")).toBe(
      "Error [unavailable]: pay no está en esta página.",
    );
    expect(serverMessages({ notOnPage: ({ tool }) => `Error [unavailable]: falta ${tool}` }).notOnPage("pay")).toBe(
      "Error [unavailable]: falta pay",
    );
    const throwing = serverMessages({
      notOnPage: () => {
        throw new Error("x");
      },
    });
    expect(throwing.notOnPage("pay")).toMatch(/is not on this page/);
    expect(serverMessages({ toolBudget: "  " }).toolBudget).toMatch(/^Tool budget/);
  });
});
