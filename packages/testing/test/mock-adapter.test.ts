import type { AgentRunRequest, AgentStreamPart } from "@webmcp-agents/chat";
import { describe, expect, test, vi } from "vitest";
import { fail, mockAdapter, reasoning, text, toolCall } from "../src/chat";

const tools = [{ name: "add_to_cart", description: "", inputSchema: {} }];
const ok = (t: string) => ({ content: [{ type: "text", text: t }] });

async function play(adapter: ReturnType<typeof mockAdapter>, req: Partial<AgentRunRequest> = {}) {
  const parts: AgentStreamPart[] = [];
  const callTool = vi.fn(async ({ name }: { name: string }) => ok(`ran ${name}`));
  for await (const p of adapter.run({ messages: [], tools, signal: new AbortController().signal, callTool, ...req })) parts.push(p);
  return { parts, callTool };
}

describe("mockAdapter", () => {
  test("owns the loop: a tool step runs the call on the page, then the next step follows", async () => {
    const adapter = mockAdapter([[reasoning("Let me look."), toolCall("add_to_cart", { qty: 2 })], text("Done: two mugs.")]);
    const { parts, callTool } = await play(adapter);
    // as the cloud adapter: each step framed by its markers, and closed (with its usage) before its calls run
    expect(parts.map((p) => p.type)).toEqual([
      "step-start",
      "message-start",
      "reasoning",
      "tool-call",
      "step-finish",
      "tool-result",
      "step-start",
      "message-start",
      "text-delta",
      "text-delta",
      "text-delta",
      "step-finish",
      "finish",
    ]);
    expect(parts.filter((p) => p.type === "step-finish")).toEqual([
      { type: "step-finish", step: 1, usage: { inputTokens: 10, outputTokens: 5 }, model: "mock/model" },
      { type: "step-finish", step: 2, usage: { inputTokens: 10, outputTokens: 5 }, model: "mock/model" },
    ]);
    expect(callTool).toHaveBeenCalledWith({ id: expect.stringMatching(/^call-\d+$/), name: "add_to_cart", input: { qty: 2 } });
    expect(adapter.run).toHaveBeenCalledOnce();
    expect(adapter.calls).toEqual([{ name: "add_to_cart", input: { qty: 2 } }]);
    expect(adapter.requests[0]!.tools).toEqual(tools);
  });

  test("fail(code) ends the run with that code", async () => {
    const adapter = mockAdapter([fail("rate_limited")]);
    const { parts } = await play(adapter);
    expect(parts).toEqual([
      { type: "step-start", step: 1 },
      { type: "error", error: "Too many requests: try again in a minute.", code: "rate_limited" },
    ]);
    expect(adapter).toHaveFinishedWith("error", "rate_limited");
  });

  test("usage: a step's own, or none at all like an on-device adapter", async () => {
    const counted = await play(mockAdapter([text("Hi.", { usage: { inputTokens: 120, outputTokens: 7, cachedInputTokens: 100 } })]));
    expect(counted.parts.find((p) => p.type === "step-finish")).toEqual({
      type: "step-finish",
      step: 1,
      usage: { inputTokens: 120, outputTokens: 7, cachedInputTokens: 100 },
      model: "mock/model",
    });
    const onDevice = await play(mockAdapter([text("Hi.")], { usage: false }));
    expect(onDevice.parts.find((p) => p.type === "step-finish")).toEqual({ type: "step-finish", step: 1 });
  });

  test("a function script is called for every model step", async () => {
    const adapter = mockAdapter((req, { step }) => (step === 1 && req.tools.length ? toolCall("add_to_cart") : text("Nothing more.")));
    await play(adapter);
    expect(adapter).toHaveCalledTools(["add_to_cart"]);
    expect(adapter).toHaveAnswered("Nothing more.");
  });

  test("a function may return a whole stream for behavior no step expresses", async () => {
    const adapter = mockAdapter(async function* (req) {
      yield { type: "message-start", messageId: "m1" };
      await new Promise<void>((r) => req.signal.addEventListener("abort", () => r(), { once: true }));
      yield { type: "finish", reason: "aborted" };
    });
    const controller = new AbortController();
    const done = play(adapter, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 10)); // the stream is waiting on the signal now
    controller.abort();
    expect((await done).parts.at(-1)).toEqual({ type: "finish", reason: "aborted" });
    expect(adapter.lastSignal).toBe(controller.signal);
    expect(adapter).toHaveFinishedWith("aborted");
  });

  test("an agent's maxSteps ends the run with max-steps", async () => {
    const adapter = mockAdapter([toolCall("add_to_cart"), toolCall("add_to_cart"), text("never")]);
    await play(adapter, { agent: { id: "a", maxSteps: 1 } as never });
    expect(adapter).toHaveFinishedWith("max-steps");
  });

  test("running out of steps fails the run with a sentence", async () => {
    const adapter = mockAdapter([toolCall("add_to_cart")]);
    const { parts } = await play(adapter);
    expect(parts.at(-1)).toMatchObject({
      type: "error",
      error: expect.stringContaining("mockAdapter ran out of steps: it was scripted with 1 step(s)"),
    });
  });

  test("text options: pieces, delay, and the script goes on across runs", async () => {
    const adapter = mockAdapter([text("abcdef", { chunks: 3, delayMs: 1 }), text("second")]);
    const first = await play(adapter);
    expect(first.parts.filter((p) => p.type === "text-delta").map((p) => (p as { delta: string }).delta)).toEqual(["ab", "cd", "ef"]);
    await play(adapter);
    expect(adapter).toHaveAnswered("second");
  });

  test("a wrong script fails with a sentence", () => {
    expect(() => mockAdapter("hi" as never)).toThrow("mockAdapter() takes a list of steps");
  });
});
