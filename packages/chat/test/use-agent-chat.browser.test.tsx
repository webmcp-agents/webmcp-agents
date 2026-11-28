import { installAgentVisuals } from "@webmcp-agents/core";
import type { UIMessage } from "ai";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { defineWebAgent } from "../src/agent";
import { type AgentChat, useAgentChat } from "../src/session/use-agent-chat";
import type { AgentAdapter } from "../src/types";
import { cleanupFixtures, echoForm, modelContext, uniqueName, until } from "@webmcp-agents/testing";
import { mockAdapter } from "@webmcp-agents/testing/chat";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Renders nothing; hands the hook's value to the test. */
function Probe({
  onChat,
  adapters,
  agent,
}: {
  onChat(c: AgentChat): void;
  adapters: AgentAdapter[];
  agent?: ReturnType<typeof defineWebAgent>;
}) {
  onChat(useAgentChat({ adapters, agent, storageKey: false }));
  return null;
}

describe("useAgentChat", () => {
  beforeAll(() => modelContext());
  afterEach(() => {
    cleanupFixtures();
    localStorage.removeItem("web-agents:chat:adapter");
  });

  it("exposes AI SDK UI messages, ChatStatus names, toolPhase for a parked call, and remembers the adapter", async () => {
    const visuals = installAgentVisuals({ yieldToUser: false }); // the park event comes from the visual layer
    const pay = uniqueName("pay");
    echoForm(pay, { autosubmit: false }); // a confirm form: the call parks until a real click
    const a = mockAdapter(
      async function* (req) {
        yield { type: "message-start", messageId: "m1" };
        yield { type: "tool-call", messageId: "m1", id: "c1", name: pay, input: { text: "x" } };
        const out = await req.callTool({ id: "c1", name: pay, input: { text: "x" } });
        yield { type: "tool-result", id: "c1", output: out };
        yield { type: "text-delta", messageId: "m1", delta: "Done." };
        yield { type: "finish", reason: "stop" };
      },
      { id: "a", label: "a" },
    );
    const b = mockAdapter(
      async function* () {
        yield { type: "finish", reason: "stop" };
      },
      { id: "b", label: "b" },
    );
    let chat!: AgentChat;
    await render(<Probe adapters={[a, b]} onChat={(c) => (chat = c)} />);
    expect(chat.status).toBe("ready");
    expect(chat.adapter.id).toBe("a");
    expect(chat.suggestions.at(-1)).toBe("What can you do on this page?");

    chat.sendMessage({ text: "pay" });
    await until(() => chat.status === "submitted" || chat.status === "streaming", 5000, "started");
    await until(() => chat.messages.some((m) => m.parts.some((p) => p.type === "dynamic-tool")), 3000, "tool part");
    await until(() => chat.toolPhase(chat.messages.at(-1)!.parts[0]!)?.phase === "parked", 4000, "parked");
    const part = chat.messages.at(-1)!.parts[0]! as Extract<UIMessage["parts"][number], { type: "dynamic-tool" }>;
    expect(part.state).toBe("input-available");
    expect(chat.toolPhase(part)?.prompt).toContain("to confirm");
    expect(chat.status).toBe("streaming");
    chat.stop();
    await until(() => chat.status === "ready", 2000, "stopped");
    expect(chat.toolPhase(chat.messages.at(-1)!.parts[0]!)?.phase).toBe("cancelled");

    chat.selectAdapter("b");
    await until(() => chat.adapter.id === "b", 5000, "switched");
    expect(localStorage.getItem("web-agents:chat:adapter")).toBe("b");
    visuals.destroy();
  });

  it("toolPhase exposes a sub-agent's nested run as UI messages", async () => {
    const helper = defineWebAgent({ id: "helper", instructions: "h" });
    const parent = defineWebAgent({ id: "parent", instructions: "p", agents: [helper] });
    const adapter = mockAdapter(
      async function* (req) {
        if (req.agent?.id === "helper") {
          yield { type: "message-start", messageId: "n1" };
          yield { type: "text-delta", messageId: "n1", delta: "Helped." };
          yield { type: "finish", reason: "stop" };
          return;
        }
        yield { type: "message-start", messageId: "m1" };
        yield { type: "tool-call", messageId: "m1", id: "d1", name: "delegate_to_helper", input: { task: "help" } };
        const out = await req.callTool({ id: "d1", name: "delegate_to_helper", input: { task: "help" } });
        yield { type: "tool-result", id: "d1", output: out };
        yield { type: "finish", reason: "stop" };
      },
      { id: "x", label: "x" },
    );
    let chat!: AgentChat;
    await render(<Probe adapters={[adapter]} agent={parent} onChat={(c) => (chat = c)} />);
    chat.sendMessage({ text: "go" });
    await until(() => chat.status === "ready" && chat.messages.length === 2, 4000, "finished");
    await sleep(10);
    const part = chat.messages[1]!.parts[0]!;
    expect(part).toMatchObject({ type: "dynamic-tool", toolName: "delegate_to_helper", state: "output-available" });
    const phase = chat.toolPhase(part)!;
    expect(phase.phase).toBe("done");
    expect(phase.agent?.id).toBe("helper");
    expect(phase.agent?.messages[0]?.parts[0]).toMatchObject({ type: "text", text: "Helped." });
    expect(chat.tools.map((t) => t.name)).toContain("delegate_to_helper");
  });
});
