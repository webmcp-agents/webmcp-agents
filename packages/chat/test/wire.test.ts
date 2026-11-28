import { convertToModelMessages } from "ai";
import { describe, expect, it } from "vitest";
import { MAX_TOOL_TEXT, readParts, toUIMessages } from "../src/adapter/wire";
import { createChatHandler } from "../src/server/handler";
import type { AgentMessage, AgentStreamPart } from "../src/types";
import { mockModel } from "@webmcp-agents/testing/server";

const out = (text: string) => ({ content: [{ type: "text", text }] });

describe("toUIMessages", () => {
  const history: AgentMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "Buy a mug" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "", providerMetadata: { anthropic: { signature: "sig" } } },
        { type: "tool", id: "c1", name: "add_to_cart", input: { qty: 1 }, state: "done", output: out("x".repeat(MAX_TOOL_TEXT + 10)) },
        { type: "tool", id: "c2", name: "checkout", input: {}, state: "cancelled" },
        { type: "tool", id: "c3", name: "apply_promo", input: {}, state: "error", error: "Error: bad code" },
      ],
    },
  ];

  it("maps text, reasoning and every tool state", () => {
    const [, assistant] = toUIMessages(history);
    expect(assistant!.parts).toMatchObject([
      { type: "reasoning", providerMetadata: { anthropic: { signature: "sig" } } },
      { type: "dynamic-tool", toolCallId: "c1", state: "output-available" },
      { type: "dynamic-tool", toolCallId: "c2", state: "output-error", errorText: "Error [cancelled]: Cancelled by the user." },
      { type: "dynamic-tool", toolCallId: "c3", state: "output-error", errorText: "Error: bad code" },
    ]);
    const text = JSON.stringify((assistant!.parts[1] as { output: unknown }).output);
    expect(text).toContain("…(truncated)");
  });

  it("skips messages left empty (a reply stopped before it began)", () => {
    expect(toUIMessages([...history, { id: "a2", role: "assistant", parts: [] }])).toHaveLength(2);
  });

  it("round-trips through convertToModelMessages into tool calls and results", async () => {
    const model = await convertToModelMessages(toUIMessages(history));
    const roles = model.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "tool"]);
    expect(JSON.stringify(model[1])).toContain('"toolCallId":"c1"');
    expect(JSON.stringify(model[2])).toContain('"toolCallId":"c3"');
  });
});

describe("readParts", () => {
  it("turns a real handler's stream into text deltas, signed reasoning and complete tool calls", async () => {
    const model = mockModel([
      { reasoning: { text: "thinking", signature: "abc" }, text: "On it. ", calls: [{ id: "c1", name: "add_to_cart", input: { qty: 2 } }] },
    ]);
    const res = await createChatHandler({ model })(
      new Request("http://x/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "two please" }] }],
          tools: [{ name: "add_to_cart", description: "Add", inputSchema: { type: "object", properties: { qty: { type: "number" } } } }],
        }),
      }),
    );
    const parts: AgentStreamPart[] = [];
    for await (const p of readParts(res.body!, "a1")) parts.push(p);
    expect(parts).toEqual([
      { type: "reasoning", messageId: "a1", text: "thinking", providerMetadata: { anthropic: { signature: "abc" } } },
      { type: "text-delta", messageId: "a1", delta: "On " },
      { type: "text-delta", messageId: "a1", delta: "it. " },
      { type: "tool-call", messageId: "a1", id: "c1", name: "add_to_cart", input: { qty: 2 } },
    ]);
  });

  it("handles events split across chunks and error chunks", async () => {
    const sse = 'data: {"type":"text-delta","id":"t","delta":"Hi"}\n\ndata: {"type":"err' + 'or","errorText":"nope"}\n\ndata: [DONE]\n\n';
    const bytes = new TextEncoder().encode(sse);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 20));
        c.enqueue(bytes.slice(20));
        c.close();
      },
    });
    const parts: AgentStreamPart[] = [];
    for await (const p of readParts(body, "m")) parts.push(p);
    expect(parts).toEqual([
      { type: "text-delta", messageId: "m", delta: "Hi" },
      { type: "error", error: "nope" },
    ]);
  });
});
