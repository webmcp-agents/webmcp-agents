/**
 * What a page loads (design §7.5): nothing beyond the subscription until a consented run starts; then the span
 * builder, and never the OpenTelemetry bridge or `@opentelemetry/api` unless the page registered a provider. Its own
 * file: each browser test file gets a fresh page, so the module list starts empty. (R-EXP-4, R-EXP-7)
 */
import { defineWebAgent } from "@webmcp-agents/chat";
import { expect, test } from "@webmcp-agents/testing";
import { mockAdapter, text } from "@webmcp-agents/testing/chat";
import { afterEach, describe, vi } from "vitest";
import { observeAgents } from "../src";

const loaded = (part: string): boolean => performance.getEntriesByType("resource").some((e) => e.name.includes(part));
const agent = defineWebAgent({ id: "lazy", instructions: "Answer." });

/** Every fetch the page makes. */
function stubFetch() {
  const calls: { url: string; body: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: String(init.body ?? "") });
    return new Response(null, { status: 202 });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("nothing loads, nothing is sent, until it must (R-EXP-4, R-EXP-7)", () => {
  test("exporters: [] and no provider: nowhere to send, so no span is built and no request is made", async () => {
    const calls = stubFetch();
    const stop = observeAgents({ exporters: [] });
    await agent.invoke("Hi.", { adapter: mockAdapter([text("Hello.")]) });
    await stop.flush();
    stop();
    expect(calls).toEqual([]);
    expect(loaded("browser/engine")).toBe(false);
  });

  test("no consent at the run's start: no span, no request, and the span builder is never downloaded", async () => {
    const calls = stubFetch();
    const stop = observeAgents({ enabled: () => false });
    await agent.invoke("Hi.", { adapter: mockAdapter([text("Hello.")]) });
    await stop.flush();
    stop();
    expect(calls).toEqual([]);
    expect(loaded("browser/engine")).toBe(false);
  });

  test("a consented run on a page without OpenTelemetry: the builder loads, spans go to /api/telemetry, the bridge never loads", async () => {
    const calls = stubFetch();
    const stop = observeAgents();
    await agent.invoke("Hi.", { adapter: mockAdapter([text("Hello.")]) });
    await stop.flush();
    stop();
    expect(loaded("browser/engine")).toBe(true);
    expect(loaded("browser/bridge")).toBe(false);
    expect(loaded("opentelemetry")).toBe(false);
    expect(calls.map((c) => c.url)).toEqual(["/api/telemetry"]);
    const body = JSON.parse(calls[0]!.body);
    expect(body.resourceSpans[0].scopeSpans[0].scope.name).toBe("@webmcp-agents/telemetry");
    expect(body.resourceSpans[0].scopeSpans[0].spans.map((s: { name: string }) => s.name).sort()).toEqual([
      "chat mock/model",
      "invoke_agent lazy",
    ]);
  });
});
