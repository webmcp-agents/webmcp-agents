import { installAgentVisuals } from "@webmcp-agents/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../src/chat.css";
import { AgentChat } from "../src/components/AgentChat";
import { act } from "react";
import type { AdapterStatus, AgentAdapter, AgentRunRequest, AgentStreamPart } from "../src/types";
import { cleanupFixtures, echoForm, modelContext, uniqueName, until } from "./browser-utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const host = () => document.querySelector<HTMLElement>(".wa-chat")!;
const q = <T extends Element = HTMLElement>(sel: string) => host().querySelector<T>(sel);

/** A scripted adapter: each run plays `script(req)`. */
function fakeAdapter(script: (req: AgentRunRequest) => AsyncGenerator<AgentStreamPart>): AgentAdapter & { lastSignal?: AbortSignal } {
  const adapter: AgentAdapter & { lastSignal?: AbortSignal } = {
    id: "fake",
    label: "Fake",
    run(req) {
      adapter.lastSignal = req.signal;
      return script(req);
    },
  };
  return adapter;
}

describe("<AgentChat>", () => {
  beforeAll(() => modelContext());
  afterEach(() => {
    cleanupFixtures();
    sessionStorage.clear();
  });

  it("opens, streams a reply, and closes back to the launcher", async () => {
    // The typing indicator shows only until the first text: the reply waits for the test to have seen it (a fixed
    // delay let a slow CI runner's `userEvent.type` round trip outlast it).
    let seen!: () => void;
    const typingSeen = new Promise<void>((r) => (seen = r));
    const adapter = fakeAdapter(async function* () {
      await typingSeen;
      yield { type: "message-start", messageId: "a1" };
      yield { type: "text-delta", messageId: "a1", delta: "Hello " };
      await sleep(20);
      yield { type: "text-delta", messageId: "a1", delta: "there." };
      yield { type: "finish", reason: "stop" };
    });
    const screen = await render(<AgentChat adapter={adapter} storageKey={false} />);
    expect(host().hasAttribute("data-web-agents-ui")).toBe(true);

    const launcher = q<HTMLButtonElement>(".wa-chat__launcher")!;
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(launcher);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    const input = q<HTMLTextAreaElement>("textarea")!;
    expect(document.activeElement).toBe(input);
    expect(q('[role="log"]') ?? q(".wa-chat__empty")).not.toBeNull();

    await userEvent.type(input, "Hi{Enter}");
    await until(() => !!q(".wa-chat__typing"), 3000, "typing indicator");
    seen();
    expect(q('[data-role="user"] .wa-chat__bubble')?.textContent).toBe("Hi");
    await until(() => q('[data-role="assistant"] .wa-chat__bubble')?.textContent === "Hello there.", 2000, "streamed text");
    expect(q('[role="log"]')).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    expect(q(".wa-chat__panel")!.hidden).toBe(true);
    expect(document.activeElement).toBe(launcher);
    await screen.unmount();
  });

  it("shows a tool card running → waiting for the person → done, from a real paused form", async () => {
    const visuals = installAgentVisuals({ yieldToUser: false });
    const name = uniqueName("confirm_echo");
    const form = echoForm(name, { autosubmit: false });
    await sleep(20);
    const adapter = fakeAdapter(async function* (req) {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "c1", name, input: { word: "yes" } };
      const output = await req.callTool({ id: "c1", name, input: { word: "yes" } });
      yield { type: "tool-result", id: "c1", output };
      yield { type: "finish", reason: "stop" };
    });
    const screen = await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "go{Enter}");

    await until(() => q(".wa-chat__tool")?.dataset.status === "awaiting", 5000, "awaiting card");
    expect(q(".wa-chat__confirm")?.textContent).toContain('Click "Send it" to confirm');
    await until(() => !!form.querySelector("[data-tool-submit-active]"), 3000, "paused submit");
    await userEvent.click(form.querySelector("button")!);
    await until(() => q(".wa-chat__tool")?.dataset.status === "done", 3000, "done card");
    expect(q(".wa-chat__tool-result")?.textContent).toBe("ok: yes");
    await screen.unmount();
    visuals.destroy();
  });

  it("Stop aborts the run and cancels the open card", async () => {
    const adapter = fakeAdapter(async function* (req) {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "c1", name: "slow", input: {} };
      await new Promise((r) => req.signal.addEventListener("abort", r));
    });
    const screen = await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "go{Enter}");
    await until(() => !!q(".wa-chat__tool"), 2000, "running card");
    await userEvent.click(q('[aria-label="Stop"]')!);
    expect(adapter.lastSignal?.aborted).toBe(true);
    await until(() => q(".wa-chat__tool")?.dataset.status === "cancelled", 5000, "cancelled card");
    expect(q('[aria-label="Send"]')).not.toBeNull();
    await screen.unmount();
  });

  it("Stop pressed before the run starts never starts it", async () => {
    let started = false;
    const adapter = fakeAdapter(async function* () {
      started = true;
      yield { type: "finish", reason: "stop" };
    });
    const screen = await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "go{Enter}");
    q<HTMLButtonElement>('[aria-label="Stop"]')!.click(); // at once, while the page's tools settle
    await sleep(300);
    expect(started).toBe(false);
    expect(q('[aria-label="Send"]')).not.toBeNull();
    await screen.unmount();
  });

  it("an unavailable adapter explains itself and can't send", async () => {
    const adapter: AgentAdapter = {
      id: "off",
      label: "Off",
      status: () => ({ state: "unavailable", reason: "Chat isn't configured on this site." }),
      run: async function* () {},
    };
    const screen = await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    expect(q(".wa-chat__offline")?.textContent).toBe("Chat isn't configured on this site.");
    expect(q<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);
    await screen.unmount();
  });

  it("errors offer a retry that runs again", async () => {
    let runs = 0;
    const adapter = fakeAdapter(async function* () {
      runs++;
      if (runs === 1) {
        yield { type: "error", error: "You're sending messages too fast. Try again in a minute.", code: "rate_limited" };
        return;
      }
      yield { type: "message-start", messageId: "a2" };
      yield { type: "text-delta", messageId: "a2", delta: "Second time lucky." };
      yield { type: "finish", reason: "stop" };
    });
    const screen = await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "go{Enter}");
    await until(() => !!q('[role="alert"]'), 5000, "error");
    expect(q('[role="alert"]')?.textContent).toContain("too fast");
    await userEvent.click(q('[role="alert"] button')!);
    await until(() => q('[data-role="assistant"] .wa-chat__bubble')?.textContent === "Second time lucky.", 5000, "retried reply");
    expect(host().querySelectorAll('[data-role="user"]')).toHaveLength(1);
    await screen.unmount();
  });

  it("switches adapters (persisted) and walks a download: consent → progress → cancel → ready", async () => {
    localStorage.removeItem("web-agents:chat:adapter");
    const cloud = fakeAdapter(async function* () {
      yield { type: "finish", reason: "stop" };
    });
    let status: AdapterStatus = { state: "needs-download", bytes: 1_440_000_000, note: "Already on this device." };
    const listeners = new Set<() => void>();
    const set = (s: AdapterStatus) => {
      status = s;
      for (const l of listeners) l();
    };
    let lastSignal: AbortSignal | undefined;
    const local: AgentAdapter = {
      id: "local",
      label: "On-device",
      status: () => status,
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      async prepare(signal) {
        lastSignal = signal;
        set({ state: "downloading", progress: 0.25 });
      },
      run: async function* () {
        yield { type: "finish", reason: "stop" };
      },
    };
    const screen = await render(<AgentChat adapters={[{ ...cloud, id: "cloud", label: "Cloud" }, local]} defaultOpen storageKey={false} />);
    const radios = () => [...host().querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios().map((r) => r.textContent)).toEqual(["Cloud", "On-device"]);
    expect(radios()[0]!.getAttribute("aria-checked")).toBe("true");
    expect(q(".wa-chat__download")).toBeNull();

    await userEvent.click(radios()[1]!);
    expect(localStorage.getItem("web-agents:chat:adapter")).toBe("local");
    expect(q(".wa-chat__download")?.textContent).toContain(
      "Downloads 1.4 GB once. Nothing you type leaves your browser. Already on this device.",
    );
    expect(q<HTMLTextAreaElement>("textarea")!.disabled).toBe(true);

    await userEvent.click([...host().querySelectorAll("button")].find((b) => b.textContent === "Download")!);
    const bar = q('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect(q(".wa-chat__download-meta")?.textContent).toBe("25% · 360 MB of 1.4 GB");

    await userEvent.click([...host().querySelectorAll("button")].find((b) => b.textContent === "Cancel")!);
    expect(lastSignal?.aborted).toBe(true);

    act(() => set({ state: "ready" }));
    await until(() => !q(".wa-chat__download"), 5000, "card gone");
    expect(q<HTMLTextAreaElement>("textarea")!.disabled).toBe(false);
    await screen.unmount();

    // the choice survives a remount
    const again = await render(<AgentChat adapters={[{ ...cloud, id: "cloud", label: "Cloud" }, local]} defaultOpen storageKey={false} />);
    expect(radios()[1]!.getAttribute("aria-checked")).toBe("true");
    await again.unmount();
  });

  it("Restore truncates the thread, refills the composer, and runs tool.revert newest-first", async () => {
    const { defineWebTool, registerWebTool } = await import("@webmcp-agents/core");
    const order: string[] = [];
    const id = uniqueName("bump");
    const tool = defineWebTool({
      id,
      description: "Bumps a counter.",
      execute: () => {
        order.push("run");
        return "ok";
      },
      revert: () => {
        order.push("revert");
      },
    });
    const unregister = registerWebTool(tool);
    const adapter = fakeAdapter(async function* (req) {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "c1", name: id, input: {} };
      const output = await req.callTool({ id: "c1", name: id, input: {} });
      yield { type: "tool-result", id: "c1", output };
      yield { type: "text-delta", messageId: "a1", delta: "Done." };
      yield { type: "finish", reason: "stop" };
    });
    const screen = await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "bump it{Enter}");
    await until(() => q('[data-role="assistant"] .wa-chat__bubble')?.textContent === "Done.", 5000, "reply");
    expect(order).toEqual(["run"]);

    await userEvent.click(q('[aria-label="Restore to before this message"]')!);
    await until(() => !q('[data-role="user"]'), 3000, "thread cleared");
    expect(order).toEqual(["run", "revert"]);
    expect(q<HTMLTextAreaElement>("textarea")!.value).toBe("bump it");
    unregister();
    await screen.unmount();
  });

  it("Restore still truncates when the tool has no revert", async () => {
    const { defineWebTool, registerWebTool } = await import("@webmcp-agents/core");
    const id = uniqueName("readonly_tool");
    const unregister = registerWebTool(
      defineWebTool({
        id,
        description: "Reads something.",
        readOnly: true,
        execute: () => "ok",
      }),
    );
    const adapter = fakeAdapter(async function* (req) {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "c1", name: id, input: {} };
      const output = await req.callTool({ id: "c1", name: id, input: {} });
      yield { type: "tool-result", id: "c1", output };
      yield { type: "finish", reason: "stop" };
    });
    const screen = await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(q<HTMLTextAreaElement>("textarea")!, "look{Enter}");
    await until(() => !!q(".wa-chat__tool") && q(".wa-chat__tool")!.dataset.status === "done", 5000, "tool done");
    await userEvent.click(q('[aria-label="Restore to before this message"]')!);
    await until(() => !q('[data-role="user"]'), 3000, "thread cleared");
    expect(q<HTMLTextAreaElement>("textarea")!.value).toBe("look");
    unregister();
    await screen.unmount();
  });

  it("docks beside the page on a wide screen, resizes from the keyboard, and gives the room back on close", async () => {
    await page.viewport(1200, 800);
    localStorage.removeItem("web-agents:chat:width");
    const root = document.documentElement;
    try {
      const adapter = fakeAdapter(async function* () {
        yield { type: "finish", reason: "stop" };
      });
      const screen = await render(<AgentChat adapter={adapter} storageKey={false} />);
      expect(root.dataset.waChatDock).toBeUndefined();

      await userEvent.click(q<HTMLButtonElement>(".wa-chat__launcher")!);
      expect(host().dataset.layout).toBe("docked");
      expect(root.dataset.waChatDock).toBe("right");
      expect(root.style.getPropertyValue("--wa-chat-inset-right")).toBe("380px");
      const panel = q(".wa-chat__panel")!;
      await until(() => Math.round(panel.getBoundingClientRect().right) === 1200, 5000, "panel at the right edge");
      expect(Math.round(panel.getBoundingClientRect().width)).toBe(380);
      expect(getComputedStyle(document.body).marginRight).toBe("380px");

      const handle = q('[role="separator"]')!;
      handle.focus();
      await userEvent.keyboard("{ArrowLeft}{Shift>}{ArrowLeft}{/Shift}");
      expect(handle.getAttribute("aria-valuenow")).toBe(String(380 + 16 + 64));
      expect(root.style.getPropertyValue("--wa-chat-inset-right")).toBe("460px");
      expect(localStorage.getItem("web-agents:chat:width")).toBe("460");
      await userEvent.keyboard("{Home}");
      expect(handle.getAttribute("aria-valuenow")).toBe("320");

      await userEvent.keyboard("{Escape}");
      expect(root.dataset.waChatDock).toBeUndefined();
      expect(root.style.getPropertyValue("--wa-chat-inset-right")).toBe("");
      await screen.unmount();
    } finally {
      localStorage.removeItem("web-agents:chat:width");
      await page.viewport(414, 896);
    }
  });
});
