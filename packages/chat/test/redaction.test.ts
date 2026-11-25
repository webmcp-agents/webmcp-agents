/**
 * Redaction in the chat, on the server and in the requests (design §8.3 rows 6, 7, 8): the URLs the model reads,
 * server logs and model errors, the handler's own rules.
 */
import { configureRedaction } from "@webmcp-agents/core/redact";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudAdapter } from "../src/adapter/cloud";
import { createChatHandler } from "../src/server/handler";
import { describeModelError } from "../src/server/model-error";
import { withPageMoves } from "../src/session/run-agent";
import type { AgentMessage } from "../src/types";
import { scriptedModel } from "./mock-model";

const KEY = "sk-abcdefghijklmnopqrstuvwx";
const CARD = "4242 4242 4242 4242";

const user = (id: string, text: string, page?: string): AgentMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
  ...(page && { page }),
});
const assistant = (id: string, text: string, page?: string): AgentMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
  ...(page && { page }),
});
const post = (body: unknown) =>
  new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

afterEach(() => {
  configureRedaction({});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("URLs the model reads", () => {
  it("the page-move note drops a reset token and an email, and keeps a search", () => {
    const moved = withPageMoves([
      user("u1", "find flights", "/results?from=CAI&to=LHR&date=2026-12-20"),
      assistant("a1", "found", "/results?from=CAI&to=LHR&date=2026-12-20"),
      user("u2", "reset it", "/reset?token=abc&email=a@b.co&page=2#top"),
    ]);
    const note = (moved[2]!.parts[0] as { text: string }).text;
    expect(note).toContain('"/results?from=CAI&to=LHR&date=2026-12-20"');
    expect(note).toContain('"/reset?token=[REDACTED]&email=[REDACTED]&page=2"');
  });

  it("the step request's page URL loses credentials, hash and sensitive parameters, and keeps the rest", async () => {
    const bodies: Array<{ page?: { url: string } }> = [];
    const handler = createChatHandler({ model: scriptedModel([{ text: "ok" }]) });
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") bodies.push(JSON.parse(String(init.body)));
      return handler(new Request(new URL(String(url), "http://shop.test"), init));
    });
    vi.stubGlobal("location", { href: "https://user:pw@shop.test/reset?token=abc&email=a@b.co&page=2#frag" });
    const adapter = createCloudAdapter({ fetch });
    for await (const _ of adapter.run({
      messages: [user("u1", "hi")],
      tools: [],
      signal: new AbortController().signal,
      callTool: vi.fn(),
    })) {
      // drain
    }
    expect(bodies[0]?.page?.url).toBe("https://shop.test/reset?token=[REDACTED]&email=[REDACTED]&page=2");
  });

  it("a search the model needs reaches it unchanged", () => {
    const moved = withPageMoves([user("u1", "a", "/"), assistant("a1", "b", "/"), user("u2", "c", "/results?from=CAI&to=LHR")]);
    expect((moved[2]!.parts[0] as { text: string }).text).toContain('"/results?from=CAI&to=LHR"');
  });
});

describe("server logs", () => {
  const apiError = (message: string) =>
    new APICallError({ message, url: "https://api.example.com/v1/responses", requestBodyValues: {}, statusCode: 401, isRetryable: false });

  it("describeModelError never echoes a key, in the chat's text or the log line", () => {
    const { message, log } = describeModelError(apiError(`Incorrect API key provided: ${KEY}`), true);
    expect(message).toContain("rejected the server's API key");
    expect(message + log).not.toContain(KEY);
  });

  it("a failed request is logged with its redacted error, never its body", async () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createChatHandler({
      model: scriptedModel([{ text: "ok" }]),
      prepareAgent: () => {
        throw new Error(`settings failed for sara@example.com with ${KEY}`);
      },
    });
    const res = await handler(post({ messages: [user("u1", `my card is ${CARD}`)], tools: [] }));
    expect(res.status).toBe(500);
    const lines = printed.mock.calls.flat().map(String).join("\n");
    expect(lines).toContain("[web-agents/chat] request failed");
    for (const secret of [KEY, "sara@example.com", CARD, "my card"]) expect(lines).not.toContain(secret);
  });

  it("a model error streamed to the page and logged on the server carries no key", async () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw apiError(`Incorrect API key provided: ${KEY}`);
      },
    });
    const res = await createChatHandler({ model })(post({ messages: [user("u1", "hi")], tools: [] }));
    expect(await res.text()).not.toContain(KEY);
    expect(printed.mock.calls.flat().map(String).join("\n")).not.toContain(KEY);
  });

  it("the handler's own rules win over the page's (process) rules", async () => {
    configureRedaction({ token: "#PAGE#" });
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createChatHandler({
      model: scriptedModel([{ text: "ok" }]),
      redact: { token: "#SERVER#" },
      prepareAgent: () => {
        throw new Error(`for sara@example.com`);
      },
    });
    await handler(post({ messages: [user("u1", "hi")], tools: [] }));
    const lines = printed.mock.calls.flat().map(String).join("\n");
    expect(lines).toContain("#SERVER#");
    expect(lines).not.toContain("#PAGE#");
  });

  it("without its own rules, the handler follows the process's, configured later", async () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createChatHandler({
      model: scriptedModel([{ text: "ok" }]),
      prepareAgent: () => {
        throw new Error("tenant T-77 failed");
      },
    });
    configureRedaction({ patterns: { tenant: { pattern: /T-\d+/g, label: "TENANT" } } });
    await handler(post({ messages: [user("u1", "hi")], tools: [] }));
    expect(printed.mock.calls.flat().map(String).join("\n")).not.toContain("T-77");
  });
});
