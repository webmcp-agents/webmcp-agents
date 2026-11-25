import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupFixtures,
  cursorVisible,
  fixture,
  modelContext,
  recordEvents,
  resultText,
  toolForm,
  uniqueName,
  until,
} from "@webmcp-agents/testing";
import { UI_HOST_ATTR } from "./user-yield";
import { type AgentVisuals, installAgentVisuals } from "./visuals";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = () => sleep(0);
const RESUME_AFTER = 100;
const LONG = "abcdefghijklmnopqrstuvwxyz";

/** Fixed-position targets the real (Playwright) mouse can be moved between. */
function targets(): Record<"farA" | "farB" | "jitA" | "jitB", HTMLElement> {
  const box = (id: string, left: number, top: number, size: number) =>
    `<div id="${id}" style="position:fixed;left:${left}px;top:${top}px;width:${size}px;height:${size}px"></div>`;
  const root = fixture(box("farA", 4, 4, 10) + box("farB", 4, 320, 10) + box("jitA", 300, 200, 2) + box("jitB", 302, 200, 2));
  const get = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  return { farA: get("farA"), farB: get("farB"), jitA: get("jitA"), jitB: get("jitB") };
}

/** Put the mouse somewhere, then wait until any yield that caused has resumed. */
async function parkMouse(el: Element): Promise<void> {
  await userEvent.hover(el);
  await sleep(RESUME_AFTER + 80);
}

describe("yield to the user", () => {
  let visuals: AgentVisuals;
  let t: ReturnType<typeof targets>;

  beforeEach(async () => {
    modelContext();
    // the tests below move the pointer to yield: opt in to that (by default only a click, a scroll, a touch or a key yields)
    visuals = installAgentVisuals({ linger: 50, yieldToUser: { resumeAfter: RESUME_AFTER, moveThreshold: 6 } });
    t = targets();
    await parkMouse(t.farA);
  });

  afterEach(() => {
    visuals.destroy();
    cleanupFixtures();
  });

  /** Start a run that types `text` (default LONG) into a text field (~1 s of animation for LONG). */
  async function startTyping(text = LONG): Promise<{ form: HTMLFormElement; run: Promise<unknown> }> {
    const name = uniqueName("t_type");
    const form = toolForm(name, { fields: '<input name="note" type="text">', answer: "typed" });
    await tick();
    const run = modelContext().executeTool(name, { note: text });
    await until(cursorVisible, 3000, "cursor visible");
    return { form, run };
  }

  it("hides the cursor at once and fast-forwards the running tool", async () => {
    const rec = recordEvents();
    const { form, run } = await startTyping();

    await userEvent.hover(t.farB);
    const yieldedAt = performance.now();
    const hiddenIn = await until(() => !cursorVisible(), 500, "cursor hidden");
    expect(hiddenIn).toBeLessThan(150);

    expect(resultText(await run)).toContain("typed");
    expect(performance.now() - yieldedAt).toBeLessThan(600); // typing alone would take ~800 ms
    expect((form.elements.namedItem("note") as HTMLInputElement).value).toBe(LONG);
    expect(rec.types()).toContain("yield");
    expect(rec.events.find((e) => e.type === "yield")).toEqual({ type: "yield", reason: "pointer" });
    rec.stop();
  });

  it("by default keeps the cursor while the pointer only moves, and yields to a click", async () => {
    visuals.setYieldToUser({ resumeAfter: RESUME_AFTER });
    const rec = recordEvents();
    // far longer than the hover can take, even on a loaded machine: the run must still be typing when it is checked
    const { run } = await startTyping(LONG.repeat(8));
    await userEvent.hover(t.farB);
    await sleep(60);
    expect(cursorVisible()).toBe(true);
    expect(rec.types()).not.toContain("yield");

    await userEvent.click(t.farB);
    await until(() => !cursorVisible(), 500, "cursor hidden");
    expect(rec.events.find((e) => e.type === "yield")).toEqual({ type: "yield", reason: "pointer" });
    await run;
    rec.stop();
  });

  it("ignores synthetic (untrusted) input", async () => {
    const rec = recordEvents();
    const { run } = await startTyping();
    for (let i = 0; i < 5; i++) {
      dispatchEvent(new PointerEvent("pointermove", { clientX: 10 + i * 40, clientY: 10, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    }
    await sleep(60);
    expect(cursorVisible()).toBe(true);
    expect(rec.types()).not.toContain("yield");
    await run;
    rec.stop();
  });

  it("ignores pointer jitter below the threshold", async () => {
    await parkMouse(t.jitA);
    const rec = recordEvents();
    const { run } = await startTyping();
    await userEvent.hover(t.jitB); // 2 px
    await sleep(60);
    expect(cursorVisible()).toBe(true);
    expect(rec.types()).not.toContain("yield");
    await run;
    rec.stop();
  });

  it("yields on a real key press but not on a bare modifier", async () => {
    const rec = recordEvents();
    const { run } = await startTyping();
    await userEvent.keyboard("{Shift}");
    await sleep(60);
    expect(rec.types()).not.toContain("yield");

    await userEvent.keyboard("{Tab}");
    await until(() => rec.types().includes("yield"), 500, "keyboard yield");
    expect(rec.events.find((e) => e.type === "yield")).toEqual({ type: "yield", reason: "keyboard" });
    await run;
    rec.stop();
  });

  it("shows the cursor again for the next call once the user is quiet", async () => {
    const rec = recordEvents();
    const first = await startTyping();
    await userEvent.hover(t.farB);
    await first.run;
    await until(() => rec.types().includes("resume"), 1000, "resume event");

    const second = await startTyping(); // waits for the cursor to be visible again
    expect(cursorVisible()).toBe(true);
    await second.run;
    rec.stop();
  });

  it("keeps the confirm ring while parked, and the user's click still completes the call", async () => {
    const rec = recordEvents();
    const name = uniqueName("t_park");
    const form = toolForm(name, { autosubmit: false, fields: "", answer: "confirmed" });
    await tick();
    const pending = modelContext().executeTool(name, {});
    await until(() => rec.types().includes("park"), 4000, "park event");

    await userEvent.hover(t.farB);
    await until(() => !cursorVisible(), 500, "cursor hidden");
    expect(document.querySelector(".agent-ring.is-visible")).not.toBeNull();

    await userEvent.click(form.querySelector("button") as HTMLButtonElement);
    expect(resultText(await pending)).toContain("confirmed");
    rec.stop();
  });

  it("can be turned off at runtime", async () => {
    visuals.setYieldToUser(false);
    const rec = recordEvents();
    const { run } = await startTyping();
    await userEvent.hover(t.farB);
    await sleep(60);
    expect(cursorVisible()).toBe(true);
    expect(rec.types()).not.toContain("yield");
    await run;
    rec.stop();
  });

  it("ignores input inside library UI hosts, including their shadow roots", async () => {
    const host = fixture(
      `<div ${UI_HOST_ATTR}><button style="position:fixed;left:250px;top:40px">Run</button></div>` +
        `<div ${UI_HOST_ATTR} class="shadow-host"></div>`,
    );
    const shadow = (host.querySelector(".shadow-host") as HTMLElement).attachShadow({ mode: "open" });
    shadow.innerHTML = `<button style="position:fixed;left:250px;top:120px">Send</button>`;
    await parkMouse(host.querySelector("button") as HTMLButtonElement);

    const rec = recordEvents();
    const { run } = await startTyping();
    await userEvent.hover(shadow.querySelector("button") as HTMLButtonElement);
    await userEvent.hover(host.querySelector("button") as HTMLButtonElement);
    await sleep(60);
    expect(cursorVisible()).toBe(true);
    expect(rec.types()).not.toContain("yield");
    await run;
    rec.stop();
  });
});
