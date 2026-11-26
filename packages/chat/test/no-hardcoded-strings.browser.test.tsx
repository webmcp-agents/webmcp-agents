/**
 * The sentinel test (design §5.4; R-CHAT-1, R-CHAT-4, task 3.9, 3.10): the chat rendered with a catalog whose every
 * entry is `⟦its.path⟧`, driven through every UI state. In each one, no text, aria-label, placeholder or title is
 * anything but a marker (or the person's, the model's, a tool's or an adapter's own words), every element carries
 * `data-wa-part`, and by the end every part name has been rendered.
 */
import { waitingForUser } from "@webmcp-agents/core";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { page, userEvent } from "vitest/browser";
import { defineWebAgent } from "../src/agent";
import "../src/chat.css";
import { CHAT_ERROR_CODES } from "../src/customize/errors";
import { CHAT_PARTS } from "../src/customize/parts";
import type { AdapterStatus, AgentAdapter, AgentRunRequest, AgentStreamPart, ModelChoice } from "../src/types";
import { test, until } from "@webmcp-agents/testing";
import { renderChat } from "@webmcp-agents/testing/chat";

/** A promise the test resolves: lets a scripted run wait for the test to look. */
function gate(): { wait: Promise<void>; open(): void } {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

/** An adapter whose status, models and runs the test sets. */
function controlled() {
  let status: AdapterStatus = { state: "loading" };
  const listeners = new Set<() => void>();
  let script: (req: AgentRunRequest) => AsyncIterable<AgentStreamPart> = async function* () {};
  const models: ModelChoice[] = [
    { id: "q", label: "Qwen Tiny", brief: "Fast at short calls.", bytes: 4e8, cached: true, recommended: true, selected: true },
    { id: "g", label: "Gemma Small", brief: "Better answers.", bytes: 1.4e9 },
  ];
  const adapter: AgentAdapter = {
    id: "ctl",
    label: "Controlled",
    labelParts: { kind: "on-device" },
    status: () => status,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    prepare: async () => {},
    models: () => models,
    selectModel: async () => {},
    run: (req) => script(req),
  };
  return {
    adapter,
    set(next: AdapterStatus) {
      status = next;
      for (const l of listeners) l();
    },
    play(next: (req: AgentRunRequest) => AsyncIterable<AgentStreamPart>) {
      script = next;
    },
  };
}

const other: AgentAdapter = { id: "other", label: "Other", labelParts: { kind: "cloud", model: "Claude" }, async *run() {} };

/** Text that is not the chat's: what the person typed, what the model and the tools answered, adapter data. */
const ALLOW = [
  "Add two mugs",
  /Try [\w_]+/g,
  "Qwen Tiny",
  "Gemma Small",
  "Fast at short calls.",
  "Better answers.",
  "GPU lost",
  "Not offered here",
  "Click Pay now.",
  "Add to cart",
  "qty: 2",
  "Added 2 mugs.",
  "Find order 1014",
  "Order 1014 is on its way.",
  "All done.",
  // a suggestion from the sub-agent's description (the page's words)
  "Finds orders",
];

describe("no hard-coded text, in any state", () => {
  beforeAll(async () => {
    await page.viewport(1100, 800); // wide: the panel docks (and shows its resize handle)
    localStorage.clear();
  });
  afterAll(async () => {
    await page.viewport(414, 896);
  });

  // One test walks every UI state in turn (~8 s alone, 37 s on a 1.5-CPU machine also running the other packages' tests).
  test("every string comes from the catalog, and every element is a part", { timeout: 120_000 }, async () => {
    const ctl = controlled();
    const helper = defineWebAgent({ id: "helper", description: "Finds orders.", instructions: "Find orders." });
    const agent = defineWebAgent({ id: "shop", instructions: "Shop.", agents: [helper] });
    const chat = await renderChat({ sentinel: true, props: { adapters: [ctl.adapter, other], agent } });
    const { host } = chat;
    const seen = new Set<string>();
    const states: string[] = [];

    /** One state: no stray text, every element a part. */
    const check = async (state: string) => {
      states.push(state);
      await new Promise((r) => requestAnimationFrame(r));
      try {
        expect(chat).toHaveNoHardcodedText({ allow: ALLOW });
      } catch (err) {
        throw new Error(`in state "${state}": ${(err as Error).message}`);
      }
      const bare = [host, ...host.querySelectorAll("*")].filter((el) => !el.hasAttribute("data-wa-part") && !el.closest("svg"));
      expect(
        bare.map((el) => el.outerHTML.slice(0, 120)),
        `elements without data-wa-part in "${state}"`,
      ).toEqual([]);
      for (const el of [host, ...host.querySelectorAll("[data-wa-part]")]) seen.add(el.getAttribute("data-wa-part")!);
    };
    const part = (name: string) => chat.part(name);
    const waitFor = (what: string, fn: () => boolean) => until(fn, 4000, what);

    // ---------- 1. the adapter getting ready ----------
    await waitFor("connecting", () => part("status") !== null);
    await check("connecting");
    ctl.set({ state: "needs-download", bytes: 1.4e9 });
    await waitFor("needs-download", () => part("downloadCard")?.dataset.state === "needs-download");
    await check("needs-download");
    ctl.set({ state: "downloading", progress: 0.4 });
    await waitFor("downloading", () => part("progress") !== null);
    await check("downloading");
    ctl.set({ state: "loading", progress: 0.5 });
    await waitFor("loading", () => part("downloadCard")?.dataset.state === "loading");
    await check("loading from disk");
    ctl.set({ state: "loading", progress: 1 });
    await check("starting");
    ctl.set({ state: "error", error: "GPU lost" });
    await waitFor("download failed", () => part("downloadCard")?.dataset.state === "error");
    await check("download failed");
    ctl.set({ state: "unavailable", reason: "x", code: "network" });
    await check("unavailable (a code)");
    ctl.set({ state: "unavailable", reason: "Not offered here" });
    await check("unavailable (the adapter's words)");
    ctl.set({ state: "ready" });
    await waitFor("ready: suggestions", () => part("suggestion") !== null);
    await check("empty");

    // ---------- 2. answering: working, a running tool, a parked tool, a sub-agent ----------
    const look = gate();
    const parked = gate();
    ctl.play(async function* (req) {
      if (req.agent?.id === "helper") {
        yield { type: "message-start", messageId: "h1" };
        yield { type: "text-delta", messageId: "h1", delta: "Order 1014 is on its way." };
        yield { type: "finish", reason: "stop" };
        return;
      }
      yield { type: "message-start", messageId: "a1" };
      await look.wait;
      yield { type: "tool-call", messageId: "a1", id: "t1", name: "add_to_cart", input: { qty: 2 } };
      await parked.wait;
      yield { type: "tool-result", id: "t1", output: { content: [{ type: "text", text: "Added 2 mugs." }] } };
      yield { type: "tool-call", messageId: "a1", id: "d1", name: "delegate_to_helper", input: { task: "Find order 1014" } };
      const out = await req.callTool({ id: "d1", name: "delegate_to_helper", input: { task: "Find order 1014" } });
      yield { type: "tool-result", id: "d1", output: out };
      yield { type: "text-delta", messageId: "a1", delta: "All done." };
      yield { type: "finish", reason: "stop" };
    });
    await userEvent.type(part("input")!, "Add two mugs{Enter}");
    await waitFor("working", () => part("working") !== null && part("stop") !== null);
    await check("answering (working)");
    look.open();
    await waitFor("a running card", () => part("toolCard")?.dataset.state === "running");
    await check("a running tool card");
    waitingForUser("add_to_cart", "Click Pay now.");
    await waitFor("a parked card", () => !!host.querySelector('[data-wa-part="toolCard"][data-state="awaiting-confirmation"]'));
    expect(part("announcer")?.textContent).toBe("⟦live.waitingForYou⟧");
    await check("a parked tool card");
    parked.open();
    await waitFor(
      "the sub-agent's card",
      () => part("subagent") !== null && host.querySelector('[data-wa-part="message"]:last-child') !== null,
    );
    await waitFor("idle", () => part("send") !== null && part("restoreAsk") !== null);
    await check("a sub-agent card, answered; restore idle");

    // ---------- 3. restore: idle → confirming → cancelled ----------
    await userEvent.click(part("restoreAsk")!);
    await waitFor("confirming", () => part("restoreConfirm") !== null);
    expect(part("restore")?.dataset.state).toBe("confirming");
    await check("restore confirming");
    await userEvent.click(part("restoreCancel")!);
    await waitFor("restore idle again", () => part("restoreAsk") !== null);

    // ---------- 4. every error code ----------
    const fails: Record<string, (req: AgentRunRequest) => AsyncIterable<AgentStreamPart>> = {
      max_steps: async function* () {
        yield { type: "finish", reason: "max-steps" };
      },
      // biome-ignore lint/correctness/useYield: it fails before its first part
      run_failed: async function* () {
        throw new Error("The provider fell over");
      },
    };
    for (const code of CHAT_ERROR_CODES) {
      ctl.play(
        fails[code] ??
          async function* () {
            yield { type: "error", error: "English the UI never shows", code: code === "unknown" ? undefined : code };
          },
      );
      await userEvent.type(part("input")!, `Try ${code}{Enter}`);
      await waitFor(`error ${code}`, () => part("error")?.dataset.state === code);
      expect(part("errorText")?.textContent).toBe(`⟦errors.${code}⟧`);
      expect(!!part("retry")).toBe(code !== "chat_disabled");
      await check(`error ${code}`);
    }
    // a server-only code reads as unknown
    ctl.play(async function* () {
      yield { type: "error", error: "Cross-site requests are not allowed.", code: "forbidden_origin" as never };
    });
    await userEvent.type(part("input")!, "Try forbidden_origin{Enter}");
    await waitFor("error unknown (server-only)", () => part("errorText")?.textContent === "⟦errors.unknown⟧" && part("send") !== null);
    await check("a server-only code");

    // ---------- 5. scrolled up while a new message arrives: "jump to latest" ----------
    const log = part("messages")!;
    log.scrollTop = 0;
    log.dispatchEvent(new Event("scroll"));
    ctl.play(async function* () {
      yield { type: "message-start", messageId: "a9" };
      yield { type: "text-delta", messageId: "a9", delta: "All done." };
      yield { type: "finish", reason: "stop" };
    });
    await userEvent.type(part("input")!, "Try jump{Enter}");
    await waitFor("jump to latest", () => part("jumpToLatest") !== null);
    await check("jump to latest");

    // ---------- 6. restore, confirmed: the note, then the empty chat again ----------
    await waitFor("idle after the last run", () => part("send") !== null && chat.parts("restoreAsk").length > 0);
    await userEvent.click(chat.parts("restoreAsk")[0]!);
    await userEvent.click(part("restoreConfirm")!);
    await waitFor("restored", () => part("restored") !== null);
    await check("restored");

    // ---------- every part was rendered at least once ----------
    // `reasoning` is only ever a page's own `Reasoning` component (the built-in chat never shows reasoning)
    const expected = CHAT_PARTS.filter((p) => p !== "reasoning");
    expect(
      expected.filter((p) => !seen.has(p)),
      `parts never rendered (states: ${states.join(", ")})`,
    ).toEqual([]);
  });
});
