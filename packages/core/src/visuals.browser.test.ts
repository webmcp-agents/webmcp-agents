import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupFixtures, cursorVisible, fixture, modelContext, recordEvents, resultText, toolForm, uniqueName, until } from "./test-utils";
import { onAgentEvent } from "./events";
import { type AgentVisuals, installAgentVisuals } from "./visuals";
import { CONFIRM, TARGET } from "./confirm";
import { UI_HOST_ATTR } from "./user-yield";
import { defineWebTool, registerWebTool, toModelContextTool } from "./web-tool";

const tick = () => new Promise((r) => setTimeout(r, 0));
const overlay = () => document.querySelectorAll(".agent-cursor, .agent-ring, .agent-spotlight, .agent-tag, .agent-sr-only").length;

describe("installAgentVisuals", () => {
  let visuals: AgentVisuals | null = null;
  let rec: ReturnType<typeof recordEvents>;

  beforeEach(() => {
    modelContext();
    // Tests drive tools from script; keep real user-input yielding out of the way unless a test opts in.
    visuals = installAgentVisuals({ linger: 50, yieldToUser: false });
    rec = recordEvents();
  });

  afterEach(() => {
    rec.stop();
    visuals?.destroy();
    visuals = null;
    cleanupFixtures();
  });

  it("installs once, is ref-counted, and tears everything down on the last destroy", async () => {
    const mc = modelContext();
    const wrapped = mc.registerTool;
    const second = installAgentVisuals({ spotlight: true });
    expect(mc.registerTool).toBe(wrapped); // shared instance, not a second wrapper

    const form = toolForm(uniqueName("t_mount"));
    await tick();
    const run = mc.executeTool(form.getAttribute("toolname") as string, { qty: 2 });
    await until(cursorVisible, 3000, "cursor visible");
    await run;
    expect(overlay()).toBeGreaterThan(0);

    second.destroy();
    second.destroy(); // idempotent: must not release the first handle too
    expect(overlay()).toBeGreaterThan(0);

    visuals?.destroy();
    visuals = null;
    expect(overlay()).toBe(0);
    expect(mc.registerTool).not.toBe(wrapped); // original registerTool restored
  });

  it("plays a declarative autosubmit form in step with the page", async () => {
    const name = uniqueName("t_add");
    const order: string[] = [];
    const form = toolForm(name, { answer: "added", onSubmit: () => order.push("page handler") });
    const off = onAgentEvent((e) => order.push(e.type));
    await tick();

    const res = await modelContext().executeTool(name, { qty: 3 });
    off();

    expect(resultText(res)).toContain("added");
    expect((form.elements.namedItem("qty") as HTMLInputElement).value).toBe("3");
    // Sync mode holds the submit: the page handles it only after the cursor typed the field.
    expect(order.indexOf("fill")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("page handler")).toBeGreaterThan(order.indexOf("fill"));
    expect(rec.types()).toEqual(expect.arrayContaining(["start", "fill", "result"]));
    const result = rec.events.find((e) => e.type === "result");
    expect(result && "ms" in result && result.ms).toBeGreaterThan(0);
  });

  it("parks on the submit button of a confirm form until the user clicks it", async () => {
    const name = uniqueName("t_confirm");
    const form = toolForm(name, { autosubmit: false, fields: "", answer: "placed" });
    await tick();

    const pending = modelContext().executeTool(name, {});
    await until(() => rec.types().includes("park"), 4000, "park event");
    const button = form.querySelector("button") as HTMLButtonElement;
    expect(button.hasAttribute("data-tool-submit-active")).toBe(true);
    const park = rec.events.find((e) => e.type === "park");
    expect(park && "prompt" in park && park.prompt).toContain("Go");

    await userEvent.click(button);
    expect(resultText(await pending)).toContain("placed");
  });

  it("runs an imperative tool's execute at the cursor's click", async () => {
    const name = uniqueName("t_clear");
    const order: string[] = [];
    fixture(`<button type="button" toolname="${name}">Clear</button>`);
    const off = onAgentEvent((e) => order.push(e.type));
    modelContext().registerTool({
      name,
      description: "test",
      execute: () => {
        order.push("execute");
        return "cleared";
      },
    });

    const res = await modelContext().executeTool(name, {});
    off();

    expect(resultText(res)).toContain("cleared");
    // execute ran between start and result: it was held until the cursor pressed the button.
    expect(order).toEqual(["start", "execute", "result"]);
  });

  it("keeps in-place library UI out of the spotlight", async () => {
    visuals?.setSpotlight(true);
    fixture(`<div ${UI_HOST_ATTR} style="position:fixed;left:0;bottom:0;width:200px;height:60px"></div>`);
    const name = uniqueName("t_spot");
    const form = toolForm(name);
    await tick();
    const run = modelContext().executeTool(name, { qty: 2 });
    const spot = document.querySelector(".agent-spotlight") as HTMLElement;
    // The browser normalises the path ("H 200"): match the host's hole loosely.
    await until(() => spot.classList.contains("is-visible") && /H\s?200\b/.test(spot.style.clipPath), 3000, "spotlight with a UI hole");
    await run;
    expect(form.isConnected).toBe(true);
    visuals?.setSpotlight(false);
  });

  it("runs an imperative tool with nothing on screen immediately, and still reports the run", async () => {
    const name = uniqueName("t_offscreen");
    modelContext().registerTool({ name, description: "test", execute: () => "done" });
    const started = performance.now();
    const res = await modelContext().executeTool(name, {});
    expect(resultText(res)).toContain("done");
    expect(performance.now() - started).toBeLessThan(100);
    expect(rec.types()).toEqual(["start", "result"]);
    expect(rec.events[1]).toMatchObject({ type: "result", tool: name, result: "done" });
    expect(rec.events[0]).toMatchObject({ type: "start", tool: name, args: {} });
  });

  it("never submits to the page when the call is cancelled while the cursor is on its way", async () => {
    const name = uniqueName("t_cancel_travel");
    let submitted = false;
    toolForm(name, { fields: '<input name="note" type="text">', onSubmit: () => (submitted = true) });
    await tick();
    const mc = modelContext();
    const pending = mc.executeTool(name, { note: "a fairly long note to type" }).catch((e: unknown) => e);
    await until(() => rec.types().includes("start"), 2000, "start event");
    expect(mc.cancelTool?.(name)).toBe(true);

    expect(await pending).toBeInstanceOf(DOMException);
    await new Promise((r) => setTimeout(r, 300)); // past any pending click
    expect(submitted).toBe(false);
    expect(rec.types().filter((t) => t === "start")).toHaveLength(1);
    expect(rec.types()).not.toContain("result");
  });

  it("hides the cursor when a call is cancelled", async () => {
    const name = uniqueName("t_cancel");
    toolForm(name, { autosubmit: false, fields: "" });
    await tick();
    const mc = modelContext();
    const pending = mc.executeTool(name, {}).catch((e: unknown) => e);
    await until(() => rec.types().includes("park"), 4000, "park event");
    expect(mc.cancelTool?.(name)).toBe(true);
    expect(await pending).toBeInstanceOf(DOMException);
    expect(rec.types()).toContain("cancel");
    await until(() => !cursorVisible(), 1000, "cursor hidden");
  });

  it("sets a hidden field in place: the cursor never flies to the page's corner for it", async () => {
    const name = uniqueName("t_hidden");
    const form = toolForm(name, {
      fields: '<input name="qty" type="number" min="1"><div style="display: none"><input name="returnDate"></div>',
    });
    await tick();
    const corner: string[] = [];
    let sampling = true;
    const sample = (): void => {
      const c = document.querySelector(".agent-cursor.is-visible")?.getBoundingClientRect();
      const ring = document.querySelector(".agent-ring.is-visible")?.getBoundingClientRect();
      if (c && c.x < 5 && c.y < 5) corner.push(`cursor ${c.x},${c.y}`);
      if (ring && ring.width < 12) corner.push(`ring ${ring.x},${ring.y} ${ring.width}x${ring.height}`);
      if (sampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    const result = await modelContext().executeTool(name, { qty: 2, returnDate: "2026-12-01" });
    sampling = false;
    expect(resultText(result)).toContain("ok");
    expect((form.elements.namedItem("returnDate") as HTMLInputElement).value).toBe("2026-12-01");
    expect(rec.events).toContainEqual(expect.objectContaining({ type: "fill", tool: name, field: "returnDate", value: "2026-12-01" }));
    expect(corner).toEqual([]);
  });

  it("drops a parked confirm when its form leaves the page, and answers the agent", async () => {
    const name = uniqueName("t_gone");
    const form = toolForm(name, { autosubmit: false, fields: "" });
    await tick();
    const pending = modelContext().executeTool(name, {});
    await until(() => rec.types().includes("park"), 4000, "park event");

    form.remove(); // the person navigated away from the page with the form
    expect(resultText(await pending)).toMatch(/left the page/);
    await until(() => rec.types().includes("cancel"), 1000, "cancel event");
    await until(() => !document.querySelector(".is-waiting") && !cursorVisible(), 1000, "unparked and hidden");
  });

  it("unparks on cancel even while another run is still open", async () => {
    const mc = modelContext();
    const first = uniqueName("t_open");
    const second = uniqueName("t_park");
    toolForm(first, { autosubmit: false, fields: "" });
    toolForm(second, { autosubmit: false, fields: "" });
    await tick();
    const a = mc.executeTool(first, {}).catch((e: unknown) => e);
    await until(() => rec.types().includes("park"), 4000, "first park");
    const b = mc.executeTool(second, {}).catch((e: unknown) => e);
    await until(() => rec.types().filter((t) => t === "park").length === 2, 4000, "second park");

    expect(mc.cancelTool?.(second)).toBe(true);
    expect(mc.cancelTool?.(first)).toBe(true);
    await Promise.all([a, b]);
    await until(() => !document.querySelector(".is-waiting"), 1000, "unparked");
  });

  it("never lets a replaced registration's unregister remove the newer one", async () => {
    const name = uniqueName("t_owner");
    const first = registerWebTool(defineWebTool({ id: name, description: "first", execute: () => "first" }));
    const second = registerWebTool(defineWebTool({ id: name, description: "second", execute: () => "second" }));
    first(); // stale: a no-op
    const tools = await modelContext().getTools();
    expect(tools.find((t) => t.name === name)?.description).toBe("second");
    second();
    expect((await modelContext().getTools()).some((t) => t.name === name)).toBe(false);
  });

  it("keeps the WebTool markers through the registerTool wrapper's spread", () => {
    const mc = toModelContextTool(
      defineWebTool({ id: "t_marks", description: "d", requireConfirmation: true, target: "#x", execute: () => {} }),
    );
    const spread = { ...mc, execute: () => {} };
    expect((spread as Record<symbol, unknown>)[CONFIRM]).toBe("#x");
    expect((spread as Record<symbol, unknown>)[TARGET]).toBe("#x");
  });

  it("animates a WebTool to its `target` selector", async () => {
    const name = uniqueName("t_target");
    fixture('<button type="button" class="t-target">Go</button>');
    const off = registerWebTool(defineWebTool({ id: name, description: "d", target: ".t-target", execute: () => "went" }));
    const res = await modelContext().executeTool(name, {});
    off();
    expect(resultText(res)).toBe("went");
    expect(rec.types()).toEqual(["start", "result"]); // gated: it found the element
  });

  it("falls back to the `toolname` element when a string `target` matches nothing", async () => {
    const name = uniqueName("t_stale");
    fixture(`<button type="button" toolname="${name}">Go</button>`);
    const off = registerWebTool(defineWebTool({ id: name, description: "d", target: "#nothing-here", execute: () => "went" }));
    const res = await modelContext().executeTool(name, {});
    off();
    expect(resultText(res)).toBe("went");
    expect(rec.types()).toEqual(["start", "result"]); // gated on the fallback element, not run unseen
  });

  it("parks a confirm-gated tool on the `toolname` element when its string `target` is stale", async () => {
    const name = uniqueName("t_stale_confirm");
    const button = fixture(`<button type="button" toolname="${name}">Place order</button>`).querySelector("button") as HTMLButtonElement;
    const off = registerWebTool(
      defineWebTool({ id: name, description: "d", requireConfirmation: true, target: "#gone", execute: () => "placed" }),
    );
    const pending = modelContext().executeTool(name, {});
    await until(
      () => document.querySelector(".agent-tag")?.textContent === 'Click "Place order" to confirm',
      4000,
      "parked on the toolname element",
    );
    await userEvent.click(button);
    expect(resultText(await pending)).toBe("placed");
    off();
  });

  it("parks on a requireConfirmation WebTool until the user clicks, and runs it once", async () => {
    const name = uniqueName("t_destroy");
    const button = fixture(`<button type="button" toolname="${name}">Clear cart</button>`).querySelector("button") as HTMLButtonElement;
    let pageHandler = 0;
    let executed = 0;
    button.addEventListener("click", () => pageHandler++);
    const off = registerWebTool(
      defineWebTool({
        id: name,
        description: "d",
        requireConfirmation: true,
        execute: () => {
          executed++;
          return "cleared";
        },
      }),
    );
    const pending = modelContext().executeTool(name, {});
    await until(() => rec.types().includes("park"), 4000, "park");
    await new Promise((r) => setTimeout(r, 2600)); // past the 2.5 s gate timeout: still waiting for the user
    expect(executed).toBe(0);
    expect(document.querySelector(".agent-cursor.is-waiting")).not.toBeNull();
    expect(document.querySelector(".agent-tag")?.textContent).toBe('Click "Clear cart" to confirm');
    await userEvent.click(button);
    expect(resultText(await pending)).toBe("cleared");
    off();
    expect(executed).toBe(1);
    expect(pageHandler).toBe(0);
    expect(rec.types().filter((t) => t === "park")).toHaveLength(1);
    expect(rec.types()).toContain("result");
  }, 10_000);
});
