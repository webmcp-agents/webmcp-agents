import type { AgentMessage, AgentRunRequest, AgentStreamPart, ToolDescriptor, WebAgent } from "@webmcp-agents/chat";
import { describe, expect, it, vi } from "vitest";
import { continuePrompt, delegatedTool, doItPrompt, failedPrompt, runLocalAgent } from "../src/loop";
import type { GenerateRequest, LocalProvider } from "../src/types";

const user: AgentMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "add 2 mugs" }] };
const tools: ToolDescriptor[] = [
  {
    name: "add_to_cart",
    description: "Add mugs",
    inputSchema: { type: "object", required: ["qty"], properties: { qty: { type: "integer", minimum: 1 } } },
  },
];

/** A provider that replies with `scripts` in order, streaming each word as a token. */
function fake(scripts: (string | ((req: GenerateRequest) => Promise<string>))[]): LocalProvider & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  let i = 0;
  return {
    id: "fake",
    label: "Fake",
    requests,
    availability: async () => ({ state: "available" }),
    prepare: async () => {},
    async generate(req) {
      requests.push(structuredClone({ ...req, signal: undefined, onToken: undefined }) as unknown as GenerateRequest);
      const s = scripts[Math.min(i++, scripts.length - 1)]!;
      const text = typeof s === "string" ? s : await s(req);
      for (const token of text.split(/(?=[ <])/)) req.onToken?.(token);
      return { text };
    },
  };
}

async function run(provider: LocalProvider, over: Partial<AgentRunRequest> = {}, opts = {}) {
  const parts: AgentStreamPart[] = [];
  const callTool = vi.fn(async () => ({ content: [{ type: "text", text: "Added 2 mugs." }] }));
  for await (const p of runLocalAgent(provider, { messages: [user], tools, signal: new AbortController().signal, callTool, ...over }, opts))
    parts.push(p);
  return { parts, callTool, types: parts.map((p) => p.type) };
}

describe("runLocalAgent", () => {
  it("a resumed turn (Retry after an interruption) continues after the last result instead of starting over", async () => {
    const provider = fake(["Added 1 mug. Done."]);
    const resumed: AgentMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool",
          id: "c1",
          name: "add_to_cart",
          input: { qty: 2 },
          state: "done",
          output: { content: [{ type: "text", text: "Added 2 mugs." }] },
        },
      ],
    };
    const { callTool } = await run(provider, { messages: [user, resumed] });
    expect(callTool).not.toHaveBeenCalled();
    const turns = provider.requests[0]!.messages;
    expect(turns.at(-2)).toMatchObject({ role: "tool", content: "Added 2 mugs." });
    expect(turns.at(-1)).toEqual({ role: "user", content: continuePrompt("add 2 mugs") });
  });

  it("a resumed failure still has to be dealt with: 'it worked' after it gets the correction", async () => {
    const provider = fake(["Added them!", "Sorry, adding failed: out of stock."]);
    const failed: AgentMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "tool", id: "c1", name: "add_to_cart", input: { qty: 2 }, state: "error", error: "Error [failed]: Out of stock." }],
    };
    const { parts } = await run(provider, { messages: [user, failed] });
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]!.messages.at(-1)).toEqual({ role: "user", content: failedPrompt("Error [failed]: Out of stock.") });
    expect(
      parts
        .filter((p) => p.type === "text-delta")
        .map((p) => (p as { delta: string }).delta)
        .join(""),
    ).toContain("out of stock");
  });

  it("text only: step-start, message-start, text deltas, step-finish, finish(stop)", async () => {
    const { types, parts } = await run(fake(["Hello there."]));
    expect(types.slice(0, 2)).toEqual(["step-start", "message-start"]);
    expect(types.slice(-2)).toEqual(["step-finish", "finish"]);
    expect(types.at(-1)).toBe("finish");
    expect(
      parts
        .filter((p) => p.type === "text-delta")
        .map((p) => (p as { delta: string }).delta)
        .join(""),
    ).toBe("Hello there.");
  });

  it("tool → result → text, never streaming the tool-call markup", async () => {
    const provider = fake(['On it. <tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>', "Done: 2 mugs."]);
    const { types, parts, callTool } = await run(provider);
    expect(types).toEqual(expect.arrayContaining(["tool-call", "tool-result", "step-finish"]));
    expect(callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "add_to_cart", input: { qty: 2 } }));
    const text = parts
      .filter((p) => p.type === "text-delta")
      .map((p) => (p as { delta: string }).delta)
      .join("");
    expect(text).not.toContain("tool_call");
    expect(text).toContain("Done: 2 mugs.");
    // the model saw its call and the result on the second step
    expect(provider.requests[1]!.messages.at(-2)).toEqual({ role: "tool", name: "add_to_cart", content: "Added 2 mugs." });
  });

  it("feeds an invalid call back once; a valid retry runs", async () => {
    const provider = fake([
      '<tool_call>{"name":"add_to_cart","arguments":{"qty":0}}</tool_call>',
      '<tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>',
      "Done.",
    ]);
    const { callTool } = await run(provider);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(provider.requests[1]!.messages.at(-1)!.content).toMatch(/^Error: add_to_cart: "qty" must be at least 1\. Try again\./);
  });

  it("a retry doesn't repeat the first attempt's prose", async () => {
    const provider = fake([
      'Adding them now. <tool_call>{"name":"add_to_cart","arguments":{"qty":0}}</tool_call>',
      'Adding them now. <tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>',
      "Done.",
    ]);
    const { parts } = await run(provider);
    const text = parts
      .filter((p) => p.type === "text-delta")
      .map((p) => (p as { delta: string }).delta)
      .join("");
    expect(text.match(/Adding them now\./g)).toHaveLength(1);
  });

  it("two invalid attempts end with an apology", async () => {
    const { parts, callTool } = await run(fake(['<tool_call>{"name":"nope","arguments":{}}</tool_call>']));
    expect(callTool).not.toHaveBeenCalled();
    expect(JSON.stringify(parts)).toContain("couldn't work out how to do that");
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "stop" });
  });

  it("stops at maxSteps, and on the same call repeated", async () => {
    const call = '<tool_call>{"name":"add_to_cart","arguments":{"qty":1}}</tool_call>';
    const max = await run(fake([call, call.replace("1", "2"), call.replace("1", "3")]), {}, { maxSteps: 2 });
    expect(max.parts.at(-1)).toEqual({ type: "finish", reason: "max-steps" });
    // the run ends on words, not a silent tool card
    expect(max.parts.at(-2)).toEqual({
      type: "text-delta",
      messageId: expect.any(String),
      delta: expect.stringMatching(/^Added 2 mugs\.\n\nI stopped after 2 steps without finishing\./),
    });
    const loop = await run(fake([call]), {}, { maxSteps: 6 });
    expect(loop.callTool).toHaveBeenCalledTimes(3); // the 2nd identical answer is flagged, the 3rd stops
    expect(JSON.stringify(loop.parts)).toContain("going in circles");
  });

  it("stops a loop that alternates between calls (search → browse → search → browse)", async () => {
    const search = '<tool_call>{"name":"search","arguments":{"q":"red tshirt"}}</tool_call>';
    const browse = '<tool_call>{"name":"browse","arguments":{"c":"apparel"}}</tool_call>';
    const loopTools: ToolDescriptor[] = ["search", "browse"].map((name) => ({
      name,
      description: name,
      inputSchema: { type: "object", properties: {} },
    }));
    const provider = fake([search, browse, search, browse, search, browse]);
    const callTool = vi.fn(async ({ name }: { name: string }) => ({
      content: [{ type: "text", text: name === "search" ? "No match." : "Apparel: tee" }],
    }));
    const parts: AgentStreamPart[] = [];
    for await (const p of runLocalAgent(provider, { messages: [user], tools: loopTools, signal: new AbortController().signal, callTool }))
      parts.push(p);
    expect(callTool).toHaveBeenCalledTimes(4);
    // the first repeat is told it learned nothing
    expect(
      provider.requests[3]!.messages.find((m) => m.role === "tool" && m.content.includes("already made this exact call")),
    ).toBeTruthy();
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "stop" });
    expect(JSON.stringify(parts)).toContain("going in circles");
  });

  it("an abort finishes as aborted", async () => {
    const ctrl = new AbortController();
    const { parts } = await run(fake(['<tool_call>{"name":"add_to_cart","arguments":{"qty":1}}</tool_call>']), {
      signal: ctrl.signal,
      callTool: async () => {
        ctrl.abort();
        return { content: [{ type: "text", text: "Error [cancelled]: Cancelled by the user." }], isError: true };
      },
    });
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "aborted" });
  });

  it("a step that takes too long is an error", async () => {
    const slow = (req: GenerateRequest) =>
      new Promise<string>((_, reject) => req.signal.addEventListener("abort", () => reject(new DOMException("t", "TimeoutError"))));
    const { parts } = await run(fake([slow]), {}, { stepTimeoutMs: 30 });
    expect(parts.at(-1)).toMatchObject({ type: "error", error: expect.stringMatching(/took too long/) });
  });

  it("a provider that ignores the signal still times out", async () => {
    const deaf = () => new Promise<string>(() => {}); // never settles, never listens
    const { parts } = await run(fake([deaf]), {}, { stepTimeoutMs: 30 });
    expect(parts.at(-1)).toMatchObject({ type: "error", error: expect.stringMatching(/took too long/) });
  });

  it("lists the tools inline for providers without template tools", async () => {
    const provider = fake(["ok"]);
    await run(provider, {}, { toolsInline: true });
    expect(provider.requests[0]!.system).toContain("- add_to_cart: Add mugs");
    expect(provider.requests[0]!.system).toContain('{"type":"tool_call","name":"add_to_cart"');
    expect(provider.requests[0]!.system).not.toContain("<tool_call>");
  });

  it("restates the user's request after a tool result, so a small model takes the next step", async () => {
    const provider = fake(['<tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>', "Done."]);
    await run(provider);
    expect(provider.requests[1]!.messages.slice(-2)).toEqual([
      { role: "tool", name: "add_to_cart", content: "Added 2 mugs." },
      { role: "user", content: continuePrompt("add 2 mugs") },
    ]);
  });

  it("offers fewer tools, then less history, until the prompt fits the model's window", async () => {
    const many: ToolDescriptor[] = Array.from({ length: 10 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool ${i}`,
      inputSchema: { type: "object", properties: {} },
    }));
    const history: AgentMessage[] = [
      { id: "u0", role: "user", parts: [{ type: "text", text: "earlier question" }] },
      { id: "a0", role: "assistant", parts: [{ type: "text", text: "earlier answer" }] },
      user,
    ];
    const provider = fake(["Hello."]);
    const seen: Array<{ tools: number; turns: number }> = [];
    provider.fits = async ({ system, messages }) => {
      const tools = (system.match(/^- tool_/gm) ?? []).length;
      seen.push({ tools, turns: messages.length });
      return tools <= 1 && messages.length === 1;
    };
    await run(provider, { tools: many, messages: history });
    expect(seen).toEqual([
      { tools: 8, turns: 3 },
      { tools: 4, turns: 3 },
      { tools: 2, turns: 3 },
      { tools: 1, turns: 3 },
      { tools: 1, turns: 1 },
    ]);
    expect(provider.requests[0]!.tools).toHaveLength(1);
    expect(provider.requests[0]!.messages).toEqual([{ role: "user", content: "add 2 mugs" }]);
  });

  it("says so when even the smallest prompt doesn't fit", async () => {
    const provider = fake(["Hello."]);
    provider.fits = async () => false;
    const { parts } = await run(provider);
    expect(parts.at(-1)).toEqual({ type: "error", error: expect.stringMatching(/too long for the on-device model/) });
    expect(provider.requests).toHaveLength(0);
  });

  it("never shows a 'done' reply right after a failed call: it goes back with the error, and the retry is what shows", async () => {
    const failing = vi.fn(async () => ({ isError: true, content: [{ type: "text", text: 'Unknown product "tee".' }] }));
    const provider = fake([
      '<tool_call>{"name":"add_to_cart","arguments":{"qty":1}}</tool_call>',
      "Opened the cart. All done.", // the hallucination: held back, never shown
      '<tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>', // the retry fixes it
      "Added.",
    ]);
    const parts: AgentStreamPart[] = [];
    let n = 0;
    const callTool = vi.fn(async () => (n++ === 0 ? failing() : { content: [{ type: "text", text: "Added 2 mugs." }] }));
    for await (const p of runLocalAgent(provider, { messages: [user], tools, signal: new AbortController().signal, callTool }))
      parts.push(p);
    const text = parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("");
    expect(text).not.toContain("All done");
    expect(text).toContain("Added.");
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(provider.requests[2]!.messages.at(-1)).toEqual({ role: "user", content: failedPrompt('Unknown product "tee".') });
  });

  it("after a failed call, a second plain reply is shown (it may say it failed)", async () => {
    const provider = fake([
      '<tool_call>{"name":"add_to_cart","arguments":{"qty":1}}</tool_call>',
      "It worked!",
      "Sorry, that product wasn't found.",
    ]);
    const callTool = vi.fn(async () => ({ isError: true, content: [{ type: "text", text: "Error: no such product." }] }));
    const parts: AgentStreamPart[] = [];
    for await (const p of runLocalAgent(provider, { messages: [user], tools, signal: new AbortController().signal, callTool }))
      parts.push(p);
    const text = parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("");
    expect(text).toBe("Sorry, that product wasn't found.");
    expect(parts.at(-1)).toEqual({ type: "finish", reason: "stop" });
  });

  it("a final answer that parrots an earlier result is replaced by what the last call did", async () => {
    const history: AgentMessage[] = [
      { id: "u0", role: "user", parts: [{ type: "text", text: "find the tee" }] },
      {
        id: "a0",
        role: "assistant",
        parts: [{ type: "text", text: "Opened Ocean Tee ($48.00). Size: S, M, L. Use add_to_cart to buy it." }],
      },
      user,
    ];
    const provider = fake([
      '<tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>',
      "Opened Ocean Tee ($48.00). Size: S, M, L. Use add_to_cart to buy it.", // the parrot
    ]);
    const callTool = vi.fn(async () => ({ content: [{ type: "text", text: "Added 2 mugs to the cart.\nTotal: $10." }] }));
    const parts: AgentStreamPart[] = [];
    for await (const p of runLocalAgent(provider, { messages: history, tools, signal: new AbortController().signal, callTool }))
      parts.push(p);
    const text = parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("");
    expect(text).toBe("Added 2 mugs to the cart.");
  });

  it("a final answer of its own is kept", async () => {
    const provider = fake(['<tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>', "Two mugs are in your cart."]);
    const parts: AgentStreamPart[] = [];
    for await (const p of runLocalAgent(provider, {
      messages: [user],
      tools,
      signal: new AbortController().signal,
      callTool: vi.fn(async () => ({ content: [{ type: "text", text: "Added 2 mugs." }] })),
    }))
      parts.push(p);
    expect(parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("")).toBe("Two mugs are in your cart.");
  });

  it("the replacement for a parroted answer keeps a short list when the result is one", async () => {
    const provider = fake(['<tool_call>{"name":"add_to_cart","arguments":{"qty":1}}</tool_call>', "Opened Apparel:"]);
    const result =
      "Opened Apparel:\n- Ocean Tee [ocean-tee]: $48.00\n- Linen Shirt [linen-shirt]: $92.00\n- Field Hoodie: $118.00\n- Ocean Socks: $16.00\nTo buy one: open_product.";
    const parts: AgentStreamPart[] = [];
    for await (const p of runLocalAgent(provider, {
      messages: [user],
      tools,
      signal: new AbortController().signal,
      callTool: vi.fn(async () => ({ content: [{ type: "text", text: result }] })),
    }))
      parts.push(p);
    expect(parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("")).toBe(
      "Opened Apparel:\n- Ocean Tee [ocean-tee]: $48.00\n- Linen Shirt [linen-shirt]: $92.00\n- Field Hoodie: $118.00\n…and 1 more.",
    );
  });

  it("tells which tool a reply hands to the user, and not a list of what's possible", () => {
    const names = new Set(["add_to_cart", "open_cart", "search_products", "go_to_page"]);
    const act = "add it to cart";
    expect(delegatedTool('To add the mug, go to the product page and click "Add to Cart".', names, act)).toBe("add_to_cart");
    expect(delegatedTool("To buy a mug, open the product page and use add_to_cart to purchase it.", names, "wanna buy a mug")).toBe(
      "add_to_cart",
    );
    // questions are answered in words
    expect(delegatedTool("You can search products, open the cart, or go to a page.", names, "What can you do on this page?")).toBeNull();
    expect(delegatedTool("Open the cart, then use remove_from_cart.", names, "how do I remove a mug")).toBeNull();
    expect(delegatedTool("Which size would you like: S, M or L?", names, act)).toBeNull(); // no tool named
    expect(delegatedTool("The add_to_cart call worked: 1 mug is in the cart.", names, act)).toBeNull(); // no instruction
  });

  it("a reply telling the user to do it goes back once ('you do it'), and the retry acts", async () => {
    const provider = fake([
      'Please go to the product page and click "Add to cart".', // the hand-off: never shown
      '<tool_call>{"name":"add_to_cart","arguments":{"qty":1}}</tool_call>',
      "One mug is in your cart.",
    ]);
    const parts: AgentStreamPart[] = [];
    const callTool = vi.fn(async () => ({ content: [{ type: "text", text: "Added 1 mug." }] }));
    for await (const p of runLocalAgent(provider, { messages: [user], tools, signal: new AbortController().signal, callTool }))
      parts.push(p);
    expect(provider.requests[1]!.messages.at(-1)).toEqual({ role: "user", content: doItPrompt("add_to_cart") });
    expect(callTool).toHaveBeenCalledOnce();
    const text = parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("");
    expect(text).not.toContain("click");
    expect(text).toBe("One mug is in your cart.");
  });
});

describe("runLocalAgent with the page's WebAgent", () => {
  // the data the loop reads (a defined agent also has `invoke`, which the loop never calls)
  const agent = {
    id: "shopper",
    instructions: ["Sells mugs.", "Open a product first."],
    agents: [{ id: "checkout", instructions: ["c"], agents: [] }],
    maxSteps: 1,
  } as unknown as WebAgent;
  const req = (over: Partial<AgentRunRequest> = {}): AgentRunRequest => ({
    messages: [user],
    tools,
    signal: new AbortController().signal,
    callTool: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
    ...over,
  });

  it("puts the agent's instructions and the delegation note in the prompt, over the adapter's own instructions", async () => {
    const provider = fake(["Hello."]);
    for await (const _ of runLocalAgent(provider, req({ agent }), { instructions: "adapter text" }));
    const system = provider.requests[0]!.system;
    expect(system).toContain("About this site:\nSells mugs.\nOpen a product first.");
    expect(system).not.toContain("adapter text");
    expect(system).toContain("delegate_to_<agent>");
  });

  it("the agent's maxSteps bounds the run", async () => {
    const provider = fake(['<tool_call>{"name": "add_to_cart", "arguments": {"qty": 2}}</tool_call>', "Second step"]);
    const parts: AgentStreamPart[] = [];
    for await (const p of runLocalAgent(provider, req({ agent }), { maxSteps: 6 })) parts.push(p);
    expect(provider.requests).toHaveLength(1);
    expect(parts.at(-1)).toMatchObject({ type: "finish" });
  });

  it("without an agent, the adapter's instructions still apply and there is no delegation note", async () => {
    const provider = fake(["Hello."]);
    for await (const _ of runLocalAgent(provider, req(), { instructions: "adapter text" }));
    expect(provider.requests[0]!.system).toContain("About this site:\nadapter text");
    expect(provider.requests[0]!.system).not.toContain("delegate_to_<agent>");
  });
});
