import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../src/chat.css";
import { defineWebAgent } from "../src/agent";
import { AgentChat } from "../src/components/AgentChat";
import { cleanupFixtures, echoForm, modelContext, uniqueName, until } from "@webmcp-agents/testing";
import { mockAdapter } from "@webmcp-agents/testing/chat";

const host = () => document.querySelector<HTMLElement>(".wa-chat")!;
const q = <T extends Element = HTMLElement>(sel: string) => host().querySelector<T>(sel);
const qa = (sel: string) => [...host().querySelectorAll<HTMLElement>(sel)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("<AgentChat agent>: sub-agents", () => {
  beforeAll(() => modelContext());
  afterEach(() => {
    cleanupFixtures();
    sessionStorage.clear();
  });

  it("filters the tools, runs a delegate as a nested run on the same adapter, and nests its cards", async () => {
    const pay = uniqueName("pay");
    const browse = uniqueName("browse");
    echoForm(pay);
    echoForm(browse);
    const checkout = defineWebAgent({ id: "checkout", description: "Pays.", instructions: "pay", tools: [pay] });
    const shopper = defineWebAgent({
      id: "shopper",
      instructions: "shop",
      tools: (ts) => ts.filter((t) => t.name !== pay),
      agents: [checkout],
    });
    const seen: { agent?: string; tools: string[] }[] = [];

    const adapter = mockAdapter(async function* (req) {
      seen.push({ agent: req.agent?.id, tools: req.tools.map((t) => t.name) });
      if (req.agent?.id === "checkout") {
        yield { type: "message-start", messageId: "n1" };
        yield { type: "tool-call", messageId: "n1", id: "c2", name: pay, input: { text: "card" } };
        const out = await req.callTool({ id: "c2", name: pay, input: { text: "card" } });
        yield { type: "tool-result", id: "c2", output: out };
        yield { type: "text-delta", messageId: "n1", delta: "Paid." };
        yield { type: "finish", reason: "stop" };
        return;
      }
      yield { type: "message-start", messageId: "a1" };
      yield {
        type: "tool-call",
        messageId: "a1",
        id: "d1",
        name: "delegate_to_checkout",
        input: { task: "Pay for the cart", context: "one mug" },
      };
      const out = await req.callTool({ id: "d1", name: "delegate_to_checkout", input: { task: "Pay for the cart", context: "one mug" } });
      yield { type: "tool-result", id: "d1", output: out };
      yield {
        type: "text-delta",
        messageId: "a1",
        delta: `Checkout says: ${out.content.map((c) => (c.type === "text" ? c.text : "")).join("")}`,
      };
      yield { type: "finish", reason: "stop" };
    });

    await render(<AgentChat adapter={adapter} agent={shopper} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "buy{Enter}");
    await until(() => q('[data-role="assistant"]')?.textContent?.includes("Checkout says: Paid.") ?? false, 4000, "parent reply");

    // the parent saw the page's tools minus `pay`, plus the delegate; the sub-agent saw only `pay`
    expect(seen[0]!.agent).toBe("shopper");
    expect(seen[0]!.tools).toContain(browse);
    expect(seen[0]!.tools).not.toContain(pay);
    expect(seen[0]!.tools).toContain("delegate_to_checkout");
    expect(seen[1]).toEqual({ agent: "checkout", tools: [pay] });
    // the sub-agent's user message carried the task and the context
    expect(adapter.requests[1]!.messages[0]!.parts[0]).toEqual({ type: "text", text: "Pay for the cart\n\nContext: one mug" });

    // the delegate card, with the nested run inside it
    const card = q(".wa-chat__tool[data-agent]")!;
    expect(card.querySelector(".wa-chat__tool-name")?.textContent).toBe("Checkout agent");
    expect(card.querySelector(".wa-chat__tool-args")?.textContent).toBe("Pay for the cart");
    const nested = card.querySelector(".wa-chat__nested")!;
    expect(nested).not.toBeNull();
    expect(nested.querySelector(".wa-chat__tool-name")?.textContent).toBe(
      pay.replace(/[_.-]+/g, " ").replace(/^./, (c) => c.toUpperCase()),
    );
    expect(nested.querySelector<HTMLElement>(".wa-chat__tool")?.dataset.status).toBe("done");
    expect(nested.textContent).toContain("Paid.");
    expect(card.dataset.status).toBe("done");
    expect(qa(".wa-chat__tool")).toHaveLength(2);
  });

  it("Stop cancels the nested run and both cards", async () => {
    const slow = uniqueName("slow");
    const helper = defineWebAgent({ id: "helper", instructions: "h" });
    const parent = defineWebAgent({ id: "parent", instructions: "p", agents: [helper] });
    const adapter = mockAdapter(async function* (req) {
      if (req.agent?.id === "helper") {
        yield { type: "message-start", messageId: "n1" };
        yield { type: "tool-call", messageId: "n1", id: "c2", name: slow, input: {} };
        await new Promise<void>((resolve) => req.signal.addEventListener("abort", () => resolve(), { once: true }));
        yield { type: "finish", reason: "aborted" };
        return;
      }
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "d1", name: "delegate_to_helper", input: { task: "wait" } };
      const out = await req.callTool({ id: "d1", name: "delegate_to_helper", input: { task: "wait" } });
      yield { type: "tool-result", id: "d1", output: out };
      yield { type: "finish", reason: req.signal.aborted ? "aborted" : "stop" };
    });
    await render(<AgentChat adapter={adapter} agent={parent} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "go{Enter}");
    await until(() => qa(".wa-chat__tool").length === 2, 4000, "nested card");
    await sleep(20);
    await userEvent.click(q('[aria-label="Stop"]')!);
    await until(() => qa(".wa-chat__tool").every((c) => c.dataset.status === "cancelled"), 4000, "both cancelled");
    expect(page.getByText("Working").elements()).toHaveLength(0);
  });
});
