/**
 * The cursor in step with what it stands for: one hand shared by calls that overlap, a ring that stays on its
 * control, boxes that do not depend on the page's CSS reset, waits that end when the person takes over, and
 * values that are never read out.
 */
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
// @ts-expect-error a stylesheet has no types here; Vite loads it, and the ring's box is what one test measures
import "./cursor.css";
import { agentCursor, wait } from "./cursor";
import { cleanupFixtures, fixture, modelContext, recordEvents, resultText, uniqueName, until } from "./test-utils";
import { type AgentVisuals, installAgentVisuals } from "./visuals";
import { defineWebTool, registerWebTool, type WebTool, type WebToolConfig } from "./web-tool";

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
/** The ring's box; an empty one before the layer has drawn anything. */
const ring = (): DOMRect => document.querySelector(".agent-ring")?.getBoundingClientRect() ?? new DOMRect();

describe("the cursor in step", () => {
  let visuals: AgentVisuals | null = null;
  let rec: ReturnType<typeof recordEvents>;
  const offs: Array<() => void> = [];

  // biome-ignore lint/suspicious/noExplicitAny: tests define tools of every input type
  function tool<I = any>(config: Omit<WebToolConfig<I, unknown>, "description">): void {
    offs.push(registerWebTool(defineWebTool<I, unknown>({ description: "test tool", ...config }) as WebTool));
  }
  const call = (id: string, args: Record<string, unknown> = {}) => modelContext().executeTool(id, args) as Promise<ModelContextToolResult>;
  const install = (options: Parameters<typeof installAgentVisuals>[0] = {}): void => {
    visuals = installAgentVisuals({ linger: 50, yieldToUser: false, ...options });
  };

  beforeEach(() => {
    modelContext();
    rec = recordEvents();
  });

  afterEach(() => {
    for (const off of offs.splice(0)) off();
    rec.stop();
    visuals?.destroy();
    visuals = null;
    cleanupFixtures();
    scrollTo(0, 0);
  });

  it("presses once, on the later call's control, when two tools are called at the same time", async () => {
    install({ linger: 400 });
    const a = uniqueName("t_first");
    const b = uniqueName("t_second");
    fixture(`
      <button id="sync-a" type="button" style="display:block">First thing</button>
      <div style="height:260px"></div>
      <button id="sync-b" type="button" style="display:block;margin-left:200px">Second thing</button>`);
    /** Where each press landed: the ripple is drawn at the hand's tip. */
    const ripples: Array<{ x: number; y: number }> = [];
    const seen = new MutationObserver((records) => {
      for (const node of records.flatMap((r) => [...r.addedNodes]))
        if (node instanceof HTMLElement && node.classList.contains("agent-ripple")) {
          const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(node.style.transform);
          ripples.push({ x: Number(m?.[1]), y: Number(m?.[2]) });
        }
    });
    seen.observe(document.body, { childList: true });
    tool({ id: a, title: "First thing", execute: () => "first" });
    tool({ id: b, title: "Second thing", execute: () => "second" });

    const results = await Promise.all([call(a), call(b)]);
    seen.disconnect();
    expect(results.map(resultText)).toEqual(["first", "second"]);
    // one hand: the first call lost it and ran without a press, the second was pressed where it is
    expect(ripples).toHaveLength(1);
    const r = byId("sync-b").getBoundingClientRect();
    expect(ripples[0]?.x).toBeGreaterThan(r.left - 4);
    expect(ripples[0]?.x).toBeLessThan(r.right + 4);
    expect(ripples[0]?.y).toBeGreaterThan(r.top - 4);
    expect(ripples[0]?.y).toBeLessThan(r.bottom + 4);
  });

  it("writes the values of a call that lost the hand, without typing them", async () => {
    install();
    const a = uniqueName("t_lost_fields");
    const b = uniqueName("t_taker");
    fixture(`
      <form><input id="sync-note" name="note"><button type="button">Save note</button></form>
      <div style="height:200px"></div>
      <button type="button">Take over</button>`);
    let saved = "";
    tool({
      id: a,
      title: "Save note",
      inputSchema: z.object({ note: z.string() }),
      execute: () => {
        saved = byId<HTMLInputElement>("sync-note").value;
      },
    });
    tool({ id: b, title: "Take over", execute: () => "taken" });
    await Promise.all([call(a, { note: "a long note that would take a while to type" }), call(b)]);
    expect(saved).toBe("a long note that would take a while to type");
  });

  it("keeps the ring of a control pressed while the person was busy on that control as the page scrolls", async () => {
    install({ yieldToUser: { resumeAfter: 3000 }, linger: 3000 }); // the run's end takes the ring away: keep it out of the way
    const id = uniqueName("t_ring_follows");
    const root = fixture(
      '<div id="sync-pad" style="height:80px"></div><button id="sync-busy" type="button">Do it</button><div style="height:1600px"></div>',
    );
    tool({ id, title: "Do it", execute: () => "done" });
    await userEvent.click(root.querySelector("#sync-pad") as Element); // the person is using the page
    await until(() => rec.types().includes("yield"), 1000, "yield");
    await new Promise((r) => setTimeout(r, 600)); // past the cursor's own fade, which kept frames coming
    await call(id);
    expect(document.querySelector(".agent-ring.is-visible")).not.toBeNull();
    scrollTo(0, 60);
    const on = (): boolean => Math.abs(ring().top - (byId("sync-busy").getBoundingClientRect().top - 4)) < 1.5;
    await until(on, 400, "the ring to follow its control");
  });

  it("frames a control evenly on a page with no box-sizing reset", async () => {
    install({ linger: 3000 });
    const id = uniqueName("t_even");
    fixture('<label>Colour <input id="sync-colour" name="colour" style="margin:40px"></label><button type="button">Pick colour</button>');
    tool({ id, title: "Pick colour", inputSchema: z.object({ colour: z.string() }), execute: () => "ok" });
    const done = call(id, { colour: "a colour with a rather long name, typed slowly" });
    const field = (): DOMRect => byId("sync-colour").getBoundingClientRect();
    await until(
      () => Math.abs(ring().left - (field().left - 4)) < 0.5 && Math.abs(ring().width - (field().width + 8)) < 1,
      2000,
      "the ring on the field",
    );
    expect(Math.abs(ring().right - (field().right + 4))).toBeLessThan(1);
    expect(Math.abs(ring().bottom - (field().bottom + 4))).toBeLessThan(1);
    await done;
  });

  it("ends a wait under way when the person takes over", async () => {
    install();
    const started = performance.now();
    const waited = wait(5000);
    agentCursor.yieldToUser(null);
    await waited;
    agentCursor.resume();
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("never reads a password out or reports it", async () => {
    install();
    const id = uniqueName("t_secret");
    fixture('<form><input id="sync-pass" name="password" type="password"><button type="button">Sign in</button></form>');
    let said = "";
    const watch = setInterval(() => (said += document.querySelector(".agent-sr-only")?.textContent ?? ""), 5);
    tool({
      id,
      title: "Sign in",
      inputSchema: z.object({ password: z.string() }),
      execute: () => byId<HTMLInputElement>("sync-pass").value,
    });
    expect(resultText(await call(id, { password: "hunter2-secret" }))).toBe("hunter2-secret"); // typed in full
    clearInterval(watch);
    expect(said).toContain("Sign in: password");
    expect(said).not.toContain("hunter2");
    expect(rec.events.filter((e) => e.type === "fill")).toEqual([{ type: "fill", tool: id, field: "password", value: "••••" }]);
  });
});
