import { describe, expect, it } from "vitest";
import { initialSession, sessionReducer } from "../src/session/reducer";
import { withPageMoves } from "../src/session/run-agent";
import type { AgentMessage } from "../src/types";

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

describe("page stamps (sessionReducer)", () => {
  it("send stamps the user message with the page it was sent from", () => {
    const s = sessionReducer(initialSession, { type: "send", id: "u1", text: "hi", page: "/shop" });
    expect(s.messages[0]).toMatchObject({ role: "user", page: "/shop" });
  });

  it("ended stamps the run's last assistant message, and nothing else", () => {
    const sent = sessionReducer(initialSession, { type: "send", id: "u1", text: "hi", page: "/" });
    // a run that ended before the model said anything: no assistant message to stamp
    expect(sessionReducer(sent, { type: "ended", page: "/shop" })).toBe(sent);
    const answered = { ...sent, messages: [...sent.messages, assistant("a1", "ok")] };
    expect(sessionReducer(answered, { type: "ended", page: "/shop" }).messages.at(-1)?.page).toBe("/shop");
    expect(sessionReducer(answered, { type: "ended" })).toBe(answered);
  });
});

describe("withPageMoves", () => {
  it("leaves a conversation where the page did not change as it is (same array)", () => {
    const same = [user("u1", "find bags", "/"), assistant("a1", "none", "/shop"), user("u2", "try totes", "/shop")];
    expect(withPageMoves(same)).toBe(same);
    // no stamps (an old stored conversation, a page without location): nothing to compare
    const old = [user("u1", "find bags"), assistant("a1", "none"), user("u2", "add it", "/product/x")];
    expect(withPageMoves(old)).toBe(old);
  });

  it("tells the model the person moved between turns, on that message only, without touching the original", () => {
    const history = [
      user("u1", "search for bags", "/"),
      assistant("a1", "No results.", "/shop"),
      user("u2", "add that item to cart", "/product/weekender-duffel"),
    ];
    const sent = withPageMoves(history);
    expect(sent).not.toBe(history);
    expect(sent[0]).toBe(history[0]);
    expect(sent[1]).toBe(history[1]);
    const parts = sent[2]!.parts;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: "text", text: expect.stringContaining('from the page "/shop" to "/product/weekender-duffel"') });
    expect(parts[1]).toEqual({ type: "text", text: "add that item to cart" });
    expect(history[2]!.parts).toHaveLength(1);
  });

  it("an unanswered message (a run that failed before replying) is where the next one is compared from", () => {
    const history = [user("u1", "search bags", "/shop"), user("u2", "add that", "/product/x")];
    const sent = withPageMoves(history);
    expect(sent[1]!.parts[0]).toMatchObject({ text: expect.stringContaining('from the page "/shop" to "/product/x"') });
  });

  it("an agent's own navigation within a run is not a move: only the run's end counts", () => {
    // the run started on "/", the agent navigated to /shop, the run ended there and the person wrote from /shop
    const history = [user("u1", "show bags", "/"), assistant("a1", "Here are the bags.", "/shop"), user("u2", "the cheapest?", "/shop")];
    expect(withPageMoves(history)).toBe(history);
  });
});
