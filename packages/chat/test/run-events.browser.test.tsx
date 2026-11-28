/**
 * Run events on a real page (R-RUN-1, R-RUN-2): calls that park for the person, yield to them or are stopped mid-flight;
 * redaction of what listeners get; the chat's conversation id across turns, a restore, a reload and a new chat; and
 * the three ways to run an agent (`useAgentSession` / the chat, `useWebAgent`, `agent.invoke`). Failure paths first.
 */
import { defineWebTool, installAgentVisuals, registerWebTool } from "@webmcp-agents/core";
import { configureRedaction } from "@webmcp-agents/core/redact";
import { expect, modelContext, test, uniqueName, until } from "@webmcp-agents/testing";
import { mockAdapter, text, toolCall } from "@webmcp-agents/testing/chat";
import { afterEach, beforeAll, describe, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { defineWebAgent } from "../src/agent";
import type { AgentRunEvent } from "../src/session/run-events";
import { type AgentSession, useAgentSession } from "../src/session/use-agent-session";
import { useWebAgent, type WebAgentHandle } from "../src/session/use-web-agent";
import type { AgentAdapter } from "../src/types";

/** A page tool whose `execute` waits until `release()` (or its call is cancelled). */
function slowTool(extra: Partial<Parameters<typeof defineWebTool>[0]> = {}) {
  let release: (value: string) => void = () => {};
  const tool = defineWebTool({
    id: uniqueName("slow_tool"),
    description: "Takes its time.",
    inputSchema: { type: "object", properties: {} },
    execute: () => new Promise<string>((resolve) => (release = resolve)),
    ...extra,
  });
  const off = registerWebTool(tool);
  return { tool, release: (v = "Done.") => release(v), off };
}

const of = <K extends AgentRunEvent["type"]>(events: readonly AgentRunEvent[], type: K) =>
  events.filter((e): e is Extract<AgentRunEvent, { type: K }> => e.type === type);

beforeAll(() => modelContext());
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("R-RUN-2 on a page: calls that wait, yield or are stopped", () => {
  test("the person stops the run while a tool is in flight: tool-finish cancelled, run-finish aborted, nothing after", async ({ runs }) => {
    const { tool, release, off } = slowTool();
    const agent = defineWebAgent({ id: "slow", instructions: "Wait.", tools: [tool] });
    const ctrl = new AbortController();
    try {
      const done = agent
        .invoke("Go.", { adapter: mockAdapter([toolCall(tool.id), text("Done.")]), signal: ctrl.signal })
        .catch((e: unknown) => e);
      await until(() => runs.types().includes("tool-start"), 5000, "tool-start");
      ctrl.abort();
      expect(await done).toHaveFinishedWith("aborted");
      release();
      await new Promise((r) => setTimeout(r, 50)); // anything late would land now
      expect(runs.types().slice(-2)).toEqual(["tool-finish", "run-finish"]);
      expect(of(runs.events, "tool-finish")[0]).toMatchObject({ state: "cancelled", code: "cancelled", tool: tool.id });
      expect(of(runs.events, "run-finish")[0]).toMatchObject({ reason: "aborted" });
      expect(runs).toHaveFinishedWith("aborted");
    } finally {
      off();
    }
  });

  test("a parked tool: tool-park precedes tool-finish, and tool-finish reports a waited time over zero", async ({ runs, mount, user }) => {
    const visuals = installAgentVisuals({ yieldToUser: false }); // the park event comes from the visual layer
    mount(`<button type="button">Pay now</button>`);
    const pay = defineWebTool({
      id: uniqueName("pay"),
      title: "Pay now",
      description: "Pay.",
      inputSchema: { type: "object", properties: {} },
      requireConfirmation: true,
      execute: () => "Paid.",
    });
    const off = registerWebTool(pay);
    try {
      const agent = defineWebAgent({ id: "payer", instructions: "Pay.", tools: [pay] });
      const done = agent.invoke("Pay.", { adapter: mockAdapter([toolCall(pay.id), text("Paid.")]) });
      await until(() => runs.types().includes("tool-park"), 5000, "tool-park");
      await new Promise((r) => setTimeout(r, 30)); // the person takes a moment
      await user.confirm("Pay now");
      await done;
      const types = runs.types();
      expect(types.indexOf("tool-park")).toBeGreaterThan(types.indexOf("tool-start"));
      expect(types.indexOf("tool-park")).toBeLessThan(types.indexOf("tool-finish"));
      expect(of(runs.events, "tool-park")[0]).toMatchObject({ tool: pay.id, prompt: expect.stringContaining("Pay now") });
      const finish = of(runs.events, "tool-finish")[0]!;
      expect(finish).toMatchObject({ state: "done" });
      expect(finish.waitedMs).toBeGreaterThan(0);
      expect(finish.ms).toBeGreaterThanOrEqual(finish.waitedMs);
    } finally {
      off();
      visuals.destroy();
    }
  });

  test("the cursor yields: a tool-yield with its reason, between that call's tool-start and tool-finish", async ({ runs, mount }) => {
    const visuals = installAgentVisuals();
    const input = mount(`<input aria-label="Notes">`).querySelector("input")!;
    const { tool, release, off } = slowTool();
    try {
      const agent = defineWebAgent({ id: "slow", instructions: "Wait.", tools: [tool] });
      const done = agent.invoke("Go.", { adapter: mockAdapter([toolCall(tool.id), text("Done.")]) });
      await until(() => runs.types().includes("tool-start"), 5000, "tool-start");
      await userEvent.click(input); // the person acts on the page while the call runs
      await until(() => runs.types().includes("tool-yield"), 3000, "tool-yield");
      release();
      await done;
      const types = runs.types();
      expect(types.indexOf("tool-yield")).toBeGreaterThan(types.indexOf("tool-start"));
      expect(types.indexOf("tool-yield")).toBeLessThan(types.indexOf("tool-finish"));
      const yielded = of(runs.events, "tool-yield")[0]!;
      expect(yielded.reason).toEqual(expect.any(String));
      expect(yielded.call).toBe(of(runs.events, "tool-start")[0]!.call);
    } finally {
      off();
      visuals.destroy();
    }
  });
});

describe("redaction of run events (R-RED-1, R-RED-3)", () => {
  test("a tool's sensitive field and a key the page configured are masked; execute and a raw listener get the values", async ({
    runs,
    redactor,
  }) => {
    expect(redactor).toBeTypeOf("function");
    configureRedaction({ keys: (d) => [...d, "loyaltyId"] });
    const received: unknown[] = [];
    const book = defineWebTool({
      id: uniqueName("book"),
      description: "Book a flight.",
      inputSchema: { type: "object", properties: { passport: { type: "string" }, loyaltyId: { type: "string" } } },
      sensitive: ["passport"],
      execute: (input: unknown) => {
        received.push(input);
        return "Booked.";
      },
    });
    const off = registerWebTool(book);
    const raw: AgentRunEvent[] = [];
    const offRaw = (await import("../src/session/run-events")).onAgentRun((e) => raw.push(e), { raw: true });
    try {
      const agent = defineWebAgent({ id: "booker", instructions: "Book.", tools: [book] });
      await agent.invoke("Book it.", {
        adapter: mockAdapter([toolCall(book.id, { passport: "A1234567", loyaltyId: "L-99" }), text("Booked.")]),
      });
    } finally {
      off();
      offRaw();
    }
    expect(received).toEqual([{ passport: "A1234567", loyaltyId: "L-99" }]);
    expect(runs).not.toContainSensitive(["A1234567", "L-99"]);
    expect(of(raw, "tool-start")[0]!.input).toEqual({ passport: "A1234567", loyaltyId: "L-99" });
  });
});

/** Renders nothing; hands the session to the test. */
function SessionProbe({ adapter, storageKey, onSession }: { adapter: AgentAdapter; storageKey: string; onSession(s: AgentSession): void }) {
  onSession(useAgentSession(adapter, { storageKey }));
  return null;
}

describe("R-RUN-1: the chat's conversation id", () => {
  test("two turns share the conversation with a new run each; a restore and a reload keep it; a new chat gets a new one", async ({
    runs,
  }) => {
    const adapter = mockAdapter([text("One."), text("Two."), text("Again."), text("After reload."), text("Fresh.")]);
    const storageKey = uniqueName("chat");
    let session!: AgentSession;
    const idle = () => until(() => session.status !== "streaming" && runs.types().at(-1) === "run-finish", 5000, "the run to end");
    const screen = await render(<SessionProbe adapter={adapter} storageKey={storageKey} onSession={(s) => (session = s)} />);

    session.send("first");
    await idle();
    session.send("second");
    await idle();
    const [a, b] = adapter.requests.map((r) => r.ref!);
    expect(b!.conversation).toBe(a!.conversation);
    expect(b!.run).not.toBe(a!.run);

    // restore to the second message and send again: the same conversation
    const second = session.messages.filter((m) => m.role === "user")[1]!;
    expect(await session.restore(second.id)).toBeDefined();
    session.send("second, again");
    await idle();
    expect(adapter.requests[2]!.ref!.conversation).toBe(a!.conversation);

    // a reload: the conversation is read back from storage with its id
    await screen.unmount();
    await render(<SessionProbe adapter={adapter} storageKey={storageKey} onSession={(s) => (session = s)} />);
    session.send("after reload");
    await idle();
    expect(adapter.requests[3]!.ref!.conversation).toBe(a!.conversation);

    // a new chat
    session.reset();
    session.send("fresh");
    await idle();
    expect(adapter.requests[4]!.ref!.conversation).not.toBe(a!.conversation);
    expect(new Set(runs.runIds()).size).toBe(5);
  });

  test("storage that refuses the id keeps it in memory: the chat still runs", async ({ runs }) => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.endsWith(":conversation")) throw new DOMException("quota", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    const adapter = mockAdapter([text("Hi.")]);
    let session!: AgentSession;
    await render(<SessionProbe adapter={adapter} storageKey={uniqueName("chat")} onSession={(s) => (session = s)} />);
    session.send("hello");
    await until(() => runs.types().at(-1) === "run-finish", 5000, "run-finish");
    expect(adapter.requests[0]!.ref!.conversation).toMatch(/^[\w.-]{1,64}$/);
  });
});

/** Renders nothing; hands the hook to the test. */
function AgentProbe({ adapter, onAgent }: { adapter: AgentAdapter; onAgent(s: WebAgentHandle): void }) {
  onAgent(useWebAgent(defineWebAgent({ id: "helper", instructions: "Help." }), { adapter }));
  return null;
}

describe("every way to run an agent emits", () => {
  test("useWebAgent and agent.invoke: run-start … run-finish with the agent's id, each a conversation of its own", async ({ runs }) => {
    let handle!: WebAgentHandle;
    await render(<AgentProbe adapter={mockAdapter([text("Hook.")])} onAgent={(h) => (handle = h)} />);
    await handle.invoke("hi");
    await defineWebAgent({ id: "direct", instructions: "Help." }).invoke("hi", { adapter: mockAdapter([text("Direct.")]) });
    const starts = of(runs.events, "run-start");
    expect(starts.map((e) => e.agent)).toEqual(["helper", "direct"]);
    expect(starts[0]!.ref.conversation).not.toBe(starts[1]!.ref.conversation);
    expect(of(runs.events, "run-finish").map((e) => e.reason)).toEqual(["stop", "stop"]);
  });
});
