import { describe, expect, it } from "vitest";
import { initialSession, type SessionState, sessionReducer } from "../src/session/reducer";
import type { AgentStreamPart } from "../src/types";

const play = (parts: AgentStreamPart[], from: SessionState = initialSession): SessionState =>
  parts.reduce((s, part) => sessionReducer(s, { type: "part", part }), sessionReducer(from, { type: "send", id: "u1", text: "hi" }));

const tools = (s: SessionState) => s.messages.flatMap((m) => m.parts).filter((p) => p.type === "tool");

describe("sessionReducer", () => {
  it("send appends the user message and starts streaming", () => {
    const s = sessionReducer(initialSession, { type: "send", id: "u1", text: "Add a mug" });
    expect(s.status).toBe("streaming");
    expect(s.messages).toEqual([{ id: "u1", role: "user", parts: [{ type: "text", text: "Add a mug" }] }]);
  });

  it("text deltas grow the right assistant message", () => {
    const s = play([
      { type: "message-start", messageId: "a1" },
      { type: "text-delta", messageId: "a1", delta: "Hel" },
      { type: "text-delta", messageId: "a1", delta: "lo" },
    ]);
    expect(s.messages[1]).toEqual({ id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello" }] });
  });

  it("tool calls go running → awaiting → done, and errors keep their text", () => {
    let s = play([
      { type: "message-start", messageId: "a1" },
      { type: "tool-call", messageId: "a1", id: "c1", name: "checkout", input: { email: "a@b.c" } },
    ]);
    expect(tools(s)[0]).toMatchObject({ state: "running" });
    s = sessionReducer(s, {
      type: "toolPhase",
      name: "checkout",
      state: "awaiting-confirmation",
      prompt: 'Click "Place order" to confirm',
    });
    expect(tools(s)[0]).toMatchObject({ state: "awaiting-confirmation", prompt: 'Click "Place order" to confirm' });
    s = sessionReducer(s, {
      type: "part",
      part: { type: "tool-result", id: "c1", output: { content: [{ type: "text", text: "Order FS-1 placed" }] } },
    });
    expect(tools(s)[0]).toMatchObject({ state: "done", prompt: undefined });

    s = play([
      { type: "message-start", messageId: "a2" },
      { type: "tool-call", messageId: "a2", id: "c2", name: "apply_promo", input: {} },
      { type: "tool-error", id: "c2", error: "Error: Promo code is not valid." },
    ]);
    expect(tools(s)[0]).toMatchObject({ state: "error", error: "Error: Promo code is not valid." });
  });

  it("stop and an aborted finish cancel open calls; errors keep their code", () => {
    const running = play([
      { type: "message-start", messageId: "a1" },
      { type: "tool-call", messageId: "a1", id: "c1", name: "x", input: {} },
    ]);
    expect(tools(sessionReducer(running, { type: "stop" }))[0]).toMatchObject({ state: "cancelled" });
    expect(tools(sessionReducer(running, { type: "part", part: { type: "finish", reason: "aborted" } }))[0]).toMatchObject({
      state: "cancelled",
    });
    const failed = sessionReducer(running, { type: "part", part: { type: "error", error: "Slow down", code: "rate_limited" } });
    expect(failed).toMatchObject({ status: "error", error: { message: "Slow down", code: "rate_limited" } });
  });

  it("retry resumes after the last finished tool call: nothing done twice, the cut-short rest dropped", () => {
    const s = play([
      { type: "message-start", messageId: "a1" },
      { type: "tool-call", messageId: "a1", id: "c1", name: "add_to_cart", input: { qty: 1 } },
      { type: "tool-result", id: "c1", output: { content: [{ type: "text", text: "Added 1 mug." }] } },
      { type: "message-start", messageId: "a2" },
      { type: "text-delta", messageId: "a2", delta: "Now che" },
      { type: "tool-call", messageId: "a2", id: "c2", name: "checkout", input: {} },
      { type: "error", error: "The on-device model took too long." },
    ]);
    expect(tools(s).map((t) => t.state)).toEqual(["done", "cancelled"]);
    const again = sessionReducer(s, { type: "retry" });
    expect(again.status).toBe("streaming");
    expect(again.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(tools(again)).toMatchObject([{ id: "c1", state: "done" }]);
  });

  it("retry drops calls the failure cut short, rather than resend them as cancelled by the user", () => {
    const s = play([
      { type: "message-start", messageId: "a1" },
      { type: "tool-call", messageId: "a1", id: "c1", name: "slow", input: {} },
      { type: "tool-call", messageId: "a1", id: "c2", name: "fast", input: {} },
      { type: "tool-result", id: "c2", output: { content: [{ type: "text", text: "ok" }] } },
      { type: "error", error: "network" },
    ]);
    expect(tools(sessionReducer(s, { type: "retry" })).map((t) => t.id)).toEqual(["c2"]);
  });

  it("retry drops everything after the last user message", () => {
    const s = play([
      { type: "message-start", messageId: "a1" },
      { type: "error", error: "boom" },
    ]);
    const again = sessionReducer(s, { type: "retry" });
    expect(again.status).toBe("streaming");
    expect(again.messages.map((m) => m.id)).toEqual(["u1"]);
    expect(again.error).toBeUndefined();
  });

  describe("sub-agent runs (within)", () => {
    const delegate = play([
      { type: "message-start", messageId: "a1" },
      { type: "tool-call", messageId: "a1", id: "d1", name: "delegate_to_checkout", input: { task: "Check out" } },
    ]);
    const within = (s: SessionState, part: AgentStreamPart) => sessionReducer(s, { type: "part", part, within: "d1" });

    it("nests a sub-agent's parts under the delegate call, keyed by its id", () => {
      let s = within(delegate, { type: "message-start", messageId: "n1" });
      s = within(s, { type: "tool-call", messageId: "n1", id: "c9", name: "checkout", input: {} });
      s = within(s, { type: "text-delta", messageId: "n1", delta: "Placed." });
      const call = tools(s)[0]!;
      expect(call.agent).toEqual({
        id: "checkout",
        messages: [
          {
            id: "n1",
            role: "assistant",
            parts: [
              { type: "tool", id: "c9", name: "checkout", input: {}, state: "running" },
              { type: "text", text: "Placed." },
            ],
          },
        ],
      });
      expect(s.status).toBe("streaming"); // the parent is still running
    });

    it("tool results, phases and stop reach nested calls; a nested finish leaves the parent streaming", () => {
      let s = within(delegate, { type: "message-start", messageId: "n1" });
      s = within(s, { type: "tool-call", messageId: "n1", id: "c9", name: "checkout", input: {} });
      s = sessionReducer(s, { type: "toolPhase", name: "checkout", state: "awaiting-confirmation", prompt: "Click Place order" });
      expect(tools(s)[0]!.agent!.messages[0]!.parts[0]).toMatchObject({ state: "awaiting-confirmation", prompt: "Click Place order" });
      s = sessionReducer(s, { type: "part", part: { type: "tool-result", id: "c9", output: { content: [{ type: "text", text: "ok" }] } } });
      expect(tools(s)[0]!.agent!.messages[0]!.parts[0]).toMatchObject({ state: "done" });
      s = within(s, { type: "finish", reason: "stop" });
      expect(s.status).toBe("streaming");
      s = within(delegate, { type: "message-start", messageId: "n2" });
      s = within(s, { type: "tool-call", messageId: "n2", id: "c10", name: "checkout", input: {} });
      s = sessionReducer(s, { type: "stop" });
      expect(tools(s)[0]).toMatchObject({ state: "cancelled" });
      expect(tools(s)[0]!.agent!.messages[0]!.parts[0]).toMatchObject({ state: "cancelled" });
    });

    it("a part for an unknown delegate id changes nothing", () => {
      expect(sessionReducer(delegate, { type: "part", part: { type: "message-start", messageId: "x" }, within: "nope" })).toBe(delegate);
    });
  });

  it("restore drops the user message and everything after it", () => {
    let s = play([
      { type: "message-start", messageId: "a1" },
      { type: "text-delta", messageId: "a1", delta: "Done." },
      { type: "finish", reason: "stop" },
    ]);
    s = sessionReducer(s, { type: "send", id: "u2", text: "again" });
    s = sessionReducer(s, { type: "part", part: { type: "message-start", messageId: "a2" } });
    const restored = sessionReducer(s, { type: "restore", beforeId: "u2" });
    expect(restored.status).toBe("idle");
    expect(restored.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(sessionReducer(s, { type: "restore", beforeId: "missing" })).toBe(s);
  });
});
