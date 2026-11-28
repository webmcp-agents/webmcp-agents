/**
 * The examples' telemetry on Vercel (design §7.7): one observability layer per function instance, shared by
 * `/api/chat` and `/api/telemetry`; the relay behind the origin rule and a per-IP limit; off (accept and drop) without
 * `OTEL_*`. Failure paths first.
 */
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVercelChatRoute, createVercelTelemetryRoute, observabilityFor } from "../src/index";

const ORIGIN = "https://demo.example";
const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const RUN_SPAN = "00f067aa0ba902b7";
const spans = JSON.stringify({
  resourceSpans: [
    {
      resource: { attributes: [] },
      scopeSpans: [
        {
          scope: { name: "@webmcp-agents/telemetry" },
          spans: [
            {
              traceId: TRACE_ID,
              spanId: RUN_SPAN,
              name: "invoke_agent shopper",
              kind: 1,
              startTimeUnixNano: "1764000000000000000",
              endTimeUnixNano: "1764000001000000000",
              attributes: [],
              status: { code: 0 },
            },
          ],
        },
      ],
    },
  ],
});
const post = (headers: Record<string, string> = { origin: ORIGIN }, body = spans) =>
  new Request(`${ORIGIN}/api/telemetry`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

const okModel = () =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "ok" },
        { type: "text-end", id: "t" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: undefined },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        },
      ]),
    }),
  });

/** Requests to the collector. */
function collector() {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(String(url));
    return new Response(null, { status: 200 });
  });
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createVercelTelemetryRoute: refusals", () => {
  it("no Origin, or another site's: 403, nothing forwarded", async () => {
    const urls = collector();
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" };
    const { POST } = createVercelTelemetryRoute({ app: "t1", env });
    expect((await POST(post({}))).status).toBe(403);
    expect((await POST(post({ origin: "https://evil.example" }))).status).toBe(403);
    await observabilityFor(env).flush();
    expect(urls).toEqual([]);
  });

  it("past RATE_LIMIT_TELEMETRY_PER_MINUTE from one IP: 429", async () => {
    const { POST } = createVercelTelemetryRoute({ app: "t2", env: { RATE_LIMIT_TELEMETRY_PER_MINUTE: "2" } });
    const from = { origin: ORIGIN, "x-forwarded-for": "203.0.113.9" };
    expect((await POST(post(from))).status).toBe(202);
    expect((await POST(post(from))).status).toBe(202);
    expect((await POST(post(from))).status).toBe(429);
  });

  it("without OTEL_* env: accepted and dropped (202, no request out)", async () => {
    const urls = collector();
    const env = {};
    const res = await createVercelTelemetryRoute({ app: "t3", env }).POST(post());
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
    await observabilityFor(env).flush();
    expect(urls).toEqual([]);
  });
});

describe("one layer per instance, shared by both routes", () => {
  it("observabilityFor returns the same layer for the same env, a new one for another", () => {
    const env = {};
    expect(observabilityFor(env)).toBe(observabilityFor(env));
    expect(observabilityFor({})).not.toBe(observabilityFor(env));
  });

  it("with OTEL_EXPORTER_OTLP_ENDPOINT, the chat's step span and the relayed browser span go to the collector", async () => {
    const urls = collector();
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", WEB_AGENTS_SESSION_SECRET: "s".repeat(32) };
    expect((await createVercelTelemetryRoute({ app: "t4", env }).POST(post())).status).toBe(202);
    const chat = createVercelChatRoute({ app: "t4", env, model: okModel(), session: false });
    const res = await chat.POST(
      new Request(`${ORIGIN}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, traceparent: `00-${TRACE_ID}-${RUN_SPAN}-01` },
        body: JSON.stringify({
          messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }],
          tools: [],
          trace: { conversation: "c", run: "r", step: 1 },
        }),
      }),
    );
    expect(res.status).toBe(200);
    await res.text();
    await observabilityFor(env).flush();
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls)).toEqual(new Set(["https://c.example/v1/traces"]));
  });
});
