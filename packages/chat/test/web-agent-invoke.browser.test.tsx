import { defineWebTool, installAgentVisuals, registerWebTool } from "@webmcp-agents/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../src/chat.css";
import { defineWebAgent, type WebAgent } from "../src/agent";
import { AgentChat } from "../src/components/AgentChat";
import { createChatHandler } from "../src/server/handler";
import { useWebAgent, type WebAgentHandle } from "../src/session/use-web-agent";
import type { AgentAdapter, AgentMessage, ToolDescriptor } from "../src/types";
import { cleanupFixtures, fixture, modelContext, uniqueName, until } from "@webmcp-agents/testing";
import { mockAdapter } from "@webmcp-agents/testing/chat";
import { mockModel, type Step } from "@webmcp-agents/testing/server";

/** `globalThis.fetch` answered by the real chat handler on a scripted model: what the default cloud adapter POSTs to. */
function serveChat(steps: Step[], agents: WebAgent[] = []) {
  const handler = createChatHandler({ model: mockModel(steps), agents });
  const bodies: { messages: AgentMessage[]; tools: ToolDescriptor[] }[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "POST") bodies.push(JSON.parse(String(init.body)));
    return handler(new Request(new URL(String(url), location.origin), init));
  });
  return { bodies, fetch };
}

/** A tool on the page that answers `Added <qty>.` and counts its runs. */
function addTool(extra: Partial<Parameters<typeof defineWebTool>[0]> = {}) {
  const runs: unknown[] = [];
  const tool = defineWebTool({
    id: uniqueName("add_to_cart"),
    description: "Add to the cart.",
    inputSchema: { type: "object", properties: { qty: { type: "number" } } },
    execute: (input: unknown) => {
      runs.push(input);
      return `Added ${(input as { qty?: number }).qty}.`;
    },
    ...extra,
  });
  return { tool, runs, off: registerWebTool(tool) };
}

/** Renders nothing; hands the hook's value to the test. */
function Probe({
  agent,
  adapter,
  onState,
}: {
  agent: ReturnType<typeof defineWebAgent>;
  adapter?: AgentAdapter;
  onState(s: WebAgentHandle): void;
}) {
  onState(useWebAgent(agent, { adapter }));
  return null;
}

describe("agent.invoke", () => {
  beforeAll(() => modelContext());
  afterEach(() => {
    vi.restoreAllMocks();
    cleanupFixtures();
  });

  it("runs a tool call and a second step through the default cloud adapter and resolves with the final text", async () => {
    const { tool, runs, off } = addTool();
    const other = addTool();
    const shopper = defineWebAgent({ id: "shopper_invoke", instructions: "Shop.", tools: [tool] });
    const { bodies } = serveChat([{ calls: [{ id: "c1", name: tool.id, input: { qty: 2 } }] }, { text: "Added two mugs." }], [shopper]);

    const { text, steps, messages } = await shopper.invoke("Add two mugs.");

    expect(text).toBe("Added two mugs.");
    expect(runs).toEqual([{ qty: 2 }]);
    expect(steps).toEqual([
      { id: "c1", tool: tool.id, input: { qty: 2 }, state: "done", output: { content: [{ type: "text", text: "Added 2." }] } },
    ]);
    expect(messages[0]).toMatchObject({ role: "user", parts: [{ type: "text", text: "Add two mugs." }] });
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(2);
    // the agent's tools only (a tool object stands for its id), and the second request carried the tool's output
    expect(bodies.map((b) => b.tools.map((t) => t.name))).toEqual([[tool.id], [tool.id]]);
    expect(bodies[1]!.messages[1]!.parts[0]).toMatchObject({ type: "tool", id: "c1", state: "done" });
    off();
    other.off();
  });

  it("reports steps as they change and nests a sub-agent's calls", async () => {
    const { tool, off } = addTool();
    const helper = defineWebAgent({ id: "helper_invoke", instructions: "h", tools: [tool.id] });
    const parent = defineWebAgent({ id: "parent_invoke", instructions: "p", agents: [helper] });
    const adapter = mockAdapter(async function* (req) {
      if (req.agent?.id === helper.id) {
        yield { type: "message-start", messageId: "n1" };
        yield { type: "tool-call", messageId: "n1", id: "c2", name: tool.id, input: { qty: 1 } };
        yield { type: "tool-result", id: "c2", output: await req.callTool({ id: "c2", name: tool.id, input: { qty: 1 } }) };
        yield { type: "text-delta", messageId: "n1", delta: "One added." };
        yield { type: "finish", reason: "stop" };
        return;
      }
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "d1", name: "delegate_to_helper_invoke", input: { task: "Add one" } };
      const out = await req.callTool({ id: "d1", name: "delegate_to_helper_invoke", input: { task: "Add one" } });
      yield { type: "tool-result", id: "d1", output: out };
      yield { type: "message-start", messageId: "a2" };
      yield { type: "text-delta", messageId: "a2", delta: "Helper says: one added." };
      yield { type: "finish", reason: "stop" };
    });
    const seen: string[] = [];

    const result = await parent.invoke("Add one", { adapter, onStep: (s) => seen.push(`${s.agent ?? "-"}:${s.tool}:${s.state}`) });

    expect(result.text).toBe("Helper says: one added.");
    expect(result.steps.map((s) => [s.agent, s.tool, s.state])).toEqual([
      [undefined, "delegate_to_helper_invoke", "done"],
      ["helper_invoke", tool.id, "done"],
    ]);
    expect(seen).toEqual([
      "-:delegate_to_helper_invoke:running",
      `helper_invoke:${tool.id}:running`,
      `helper_invoke:${tool.id}:done`,
      "-:delegate_to_helper_invoke:done",
    ]);
    off();
  });

  it("aborting the signal cancels the tool in flight and rejects with an AbortError", async () => {
    let cancelled = false;
    const slow = defineWebTool({
      id: uniqueName("slow"),
      description: "Waits.",
      execute: (_input: unknown, { signal }) =>
        new Promise<string>((_, reject) =>
          signal.addEventListener("abort", () => {
            cancelled = true;
            reject(signal.reason);
          }),
        ),
    });
    const off = registerWebTool(slow);
    const agent = defineWebAgent({ id: "waiter", instructions: "w" });
    const adapter = mockAdapter(async function* (req) {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "c1", name: slow.id, input: {} };
      const out = await req.callTool({ id: "c1", name: slow.id, input: {} });
      yield { type: "tool-result", id: "c1", output: out };
      yield { type: "finish", reason: "stop" };
    });
    const ac = new AbortController();
    const steps: string[] = [];
    const run = agent.invoke("wait", { adapter, signal: ac.signal, onStep: (s) => steps.push(s.state) });
    await until(() => steps.includes("running"), 3000, "tool running");
    ac.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    await until(() => cancelled, 2000, "tool cancelled");
    // an already aborted signal never starts
    await expect(agent.invoke("again", { adapter, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: "AbortError" });
    off();
  });

  it("a failed run rejects with the adapter's message and code; an empty message is refused", async () => {
    const agent = defineWebAgent({ id: "failer", instructions: "f" });
    const adapter = mockAdapter(async function* () {
      yield { type: "error", error: "Too fast.", code: "rate_limited" };
    });
    await expect(agent.invoke("hi", { adapter })).rejects.toMatchObject({ message: "Too fast.", code: "rate_limited" });
    await expect(agent.invoke("  ", { adapter })).rejects.toThrow(/needs a message/);
  });
});

describe("useWebAgent", () => {
  beforeAll(() => modelContext());
  afterEach(() => {
    vi.restoreAllMocks();
    cleanupFixtures();
  });

  it("goes running → waiting while a tool is parked on its confirmation → running → idle, with live steps and text", async () => {
    const visuals = installAgentVisuals({ yieldToUser: false }); // the park event comes from the visual layer
    fixture(`<button type="button">Pay now</button>`);
    const { tool, runs, off } = addTool({ title: "Pay now", requireConfirmation: true });
    const agent = defineWebAgent({ id: "payer", instructions: "Pay.", tools: [tool] });
    const adapter = mockAdapter(async function* (req) {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "c1", name: tool.id, input: { qty: 1 } };
      yield { type: "tool-result", id: "c1", output: await req.callTool({ id: "c1", name: tool.id, input: { qty: 1 } }) };
      yield { type: "text-delta", messageId: "a1", delta: "Paid " };
      yield { type: "text-delta", messageId: "a1", delta: "for one." };
      yield { type: "finish", reason: "stop" };
    });
    let state!: WebAgentHandle;
    const statuses: string[] = [];
    await render(
      <Probe
        agent={agent}
        adapter={adapter}
        onState={(s) => {
          state = s;
          if (statuses.at(-1) !== s.status) statuses.push(s.status);
        }}
      />,
    );
    expect(state.status).toBe("idle");

    const done = state.invoke("Pay for one");
    await until(() => state.status === "waiting", 5000, "waiting");
    expect(state.steps).toMatchObject([{ id: "c1", tool: tool.id, state: "awaiting-confirmation", prompt: 'Click "Pay now" to confirm' }]);
    expect(runs).toEqual([]);

    await userEvent.click(document.querySelector("button")!);
    const result = await done;
    await until(() => state.status === "idle", 3000, "idle");
    expect(runs).toEqual([{ qty: 1 }]);
    expect(result?.text).toBe("Paid for one.");
    expect(state.text).toBe("Paid for one.");
    expect(state.steps).toMatchObject([{ state: "done" }]);
    // React may batch the short "running" after the click into the same render as "idle"
    expect(statuses.slice(0, 3)).toEqual(["idle", "running", "waiting"]);
    expect(statuses.at(-1)).toBe("idle");
    off();
    visuals.destroy();
  });

  it("stop() cancels the run: status idle, the open step cancelled, invoke resolves undefined", async () => {
    const agent = defineWebAgent({ id: "stopper", instructions: "s" });
    const adapter = mockAdapter(async function* (req) {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "c1", name: "nothing_here", input: {} };
      await new Promise<void>((resolve) => req.signal.addEventListener("abort", () => resolve(), { once: true }));
      yield { type: "finish", reason: "aborted" };
    });
    let state!: WebAgentHandle;
    await render(<Probe agent={agent} adapter={adapter} onState={(s) => (state = s)} />);
    const run = state.invoke("go");
    await until(() => state.steps[0]?.state === "running", 3000, "step running");
    state.stop();
    expect(await run).toBeUndefined();
    await until(() => state.status === "idle", 5000, "idle");
    expect(state.steps).toMatchObject([{ state: "cancelled" }]);
    expect(state.error).toBeUndefined();
  });

  it("a failed run sets status error and error; the next invoke clears it", async () => {
    const agent = defineWebAgent({ id: "flaky", instructions: "f" });
    let fail = true;
    const adapter = mockAdapter(async function* () {
      if (fail) {
        yield { type: "error", error: "Couldn't reach the assistant.", code: "network" };
        return;
      }
      yield { type: "message-start", messageId: "a1" };
      yield { type: "text-delta", messageId: "a1", delta: "Fine." };
      yield { type: "finish", reason: "stop" };
    });
    let state!: WebAgentHandle;
    await render(<Probe agent={agent} adapter={adapter} onState={(s) => (state = s)} />);
    expect(await state.invoke("go")).toBeUndefined();
    await until(() => state.status === "error", 5000, "error");
    expect(state.error).toEqual({ message: "Couldn't reach the assistant.", code: "network" });
    fail = false;
    expect((await state.invoke("again"))?.text).toBe("Fine.");
    await until(() => state.status === "idle", 5000, "idle");
    expect(state.error).toBeUndefined();
  });
});

describe("<AgentChat> without adapters", () => {
  beforeAll(() => modelContext());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("uses the default cloud adapter on /api/chat", async () => {
    const agent = defineWebAgent({ id: "chat_default", instructions: "c" });
    const { fetch } = serveChat([{ text: "Hello from the cloud." }], [agent]);
    const screen = await render(<AgentChat agent={agent} defaultOpen storageKey={false} />);
    const host = () => document.querySelector<HTMLElement>(".wa-chat")!;
    await userEvent.type(host().querySelector("textarea")!, "Hi{Enter}");
    await until(() => host().querySelector('[data-role="assistant"]')?.textContent === "Hello from the cloud.", 4000, "reply");
    expect(fetch.mock.calls.some(([url, init]) => String(url) === "/api/chat" && init?.method === "POST")).toBe(true);
    await screen.unmount();
  });
});
