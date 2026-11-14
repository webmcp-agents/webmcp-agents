import { describe, expect, it } from "vitest";
import type { AgentMessage } from "../src/types";
import { doneToolsAfter, messageText, outputValue, RestoreJournal } from "../src/session/restore-journal";

describe("restore-journal", () => {
  it("messageText joins text parts", () => {
    expect(messageText({ id: "u", role: "user", parts: [{ type: "text", text: "Hi" }, { type: "text", text: " there" }] })).toBe(
      "Hi there",
    );
  });

  it("doneToolsAfter collects completed calls from the checkpoint onward, nested included", () => {
    const messages: AgentMessage[] = [
      { id: "u0", role: "user", parts: [{ type: "text", text: "earlier" }] },
      {
        id: "a0",
        role: "assistant",
        parts: [{ type: "tool", id: "old", name: "old_tool", input: {}, state: "done", output: { content: [] } }],
      },
      { id: "u1", role: "user", parts: [{ type: "text", text: "do it" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool",
            id: "d1",
            name: "delegate_to_x",
            input: {},
            state: "done",
            output: { content: [] },
            agent: {
              id: "x",
              messages: [
                {
                  id: "n1",
                  role: "assistant",
                  parts: [
                    {
                      type: "tool",
                      id: "c1",
                      name: "inner",
                      input: { n: 1 },
                      state: "done",
                      output: { content: [{ type: "text", text: "ok" }] },
                    },
                    { type: "tool", id: "c2", name: "failed", input: {}, state: "error", error: "nope" },
                  ],
                },
              ],
            },
          },
          { type: "tool", id: "c3", name: "outer", input: {}, state: "done", output: { content: [{ type: "text", text: "2" }] } },
        ],
      },
    ];
    expect(doneToolsAfter(messages, "u1").map((p) => p.id)).toEqual(["d1", "c1", "c3"]);
  });

  it("outputValue parses JSON text when possible", () => {
    expect(outputValue({ content: [{ type: "text", text: '{"a":1}' }] })).toEqual({ a: 1 });
    expect(outputValue({ content: [{ type: "text", text: "plain" }] })).toBe("plain");
  });

  it("journal attaches fills only to the open call id", () => {
    const journal = new RestoreJournal();
    journal.beginCall("c1", "fill_me");
    const control = { isConnected: true } as HTMLInputElement;
    journal.recordFill("fill_me", { field: "name", from: "", value: "Ada", control });
    journal.recordFill("other", { field: "x", from: "", value: "y", control });
    expect(journal.fillsFor("c1")).toHaveLength(1);
    expect(journal.fillsFor("c1")[0]).toMatchObject({ field: "name", from: "", value: "Ada" });
    journal.endCall("c1", "fill_me");
    journal.recordFill("fill_me", { field: "name", from: "Ada", value: "Bob", control });
    expect(journal.fillsFor("c1")).toHaveLength(1);
  });
});
