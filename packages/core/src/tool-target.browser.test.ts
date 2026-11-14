/**
 * A tool with nothing added to the markup: the cursor finds its control by name, types the call's values into the
 * fields it finds, runs `fill`, then clicks (or parks for the person's click).
 */
import { cdp, userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { cleanupFixtures, fixture, modelContext, recordEvents, resultText, uniqueName, until } from "./test-utils";
import { toolErrorCode, WebToolError } from "./result";
import { type AgentVisuals, installAgentVisuals } from "./visuals";
import { defineWebTool, OPEN_TARGET_MS, registerWebTool, type WebTool, type WebToolConfig } from "./web-tool";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Which element the cursor is on when `execute` runs. */
const pressed = (): string | undefined => document.querySelector("[data-agent-active]")?.id;

describe("a tool's control and fields", () => {
  let visuals: AgentVisuals | null = null;
  let rec: ReturnType<typeof recordEvents>;
  const offs: Array<() => void> = [];

  // biome-ignore lint/suspicious/noExplicitAny: tests define tools of every input type
  function tool<I = any>(config: Omit<WebToolConfig<I, unknown>, "description">): WebTool<I, unknown> {
    const defined = defineWebTool<I, unknown>({ description: "test tool", ...config });
    offs.push(registerWebTool(defined as WebTool));
    return defined;
  }
  const call = (id: string, args: Record<string, unknown> = {}) => modelContext().executeTool(id, args) as Promise<ModelContextToolResult>;

  beforeEach(() => {
    modelContext();
    visuals = installAgentVisuals({ linger: 50, yieldToUser: false });
    rec = recordEvents();
  });

  afterEach(async () => {
    for (const off of offs.splice(0)) off();
    rec.stop();
    visuals?.destroy();
    visuals = null;
    cleanupFixtures();
    vi.restoreAllMocks();
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  // ---------- where a tool acts ----------

  it("finds its control by the tool's title, and holds execute until the cursor presses it", async () => {
    const id = uniqueName("t_title");
    fixture('<button id="other" type="button">Something else</button><button id="clear" type="button">Clear cart</button>');
    let at: string | undefined;
    tool({
      id,
      title: "Clear cart",
      execute: () => {
        at = pressed();
      },
    });
    await call(id);
    expect(at).toBe("clear");
    expect(rec.types()).toEqual(["start", "result"]);
  });

  it("finds its control by the id read as words when it has no title", async () => {
    const id = uniqueName("open_orders");
    fixture(`<a id="link" href="#orders">${id.replaceAll("_", " ")}</a>`);
    let at: string | undefined;
    tool({
      id,
      execute: () => {
        at = pressed();
      },
    });
    await call(id);
    expect(at).toBe("link");
  });

  it("prefers an explicit target, then a `toolname` marker, then the name", async () => {
    const id = uniqueName("t_order");
    const root = fixture(`
      <button id="named" type="button">Place order</button>
      <button id="marked" type="button" toolname="${id}">Buy</button>
      <button id="targeted" type="button" class="t-order-target">Pay now</button>`);
    const seen: Array<string | undefined> = [];
    const execute = () => void seen.push(pressed());
    tool({ id, title: "Place order", target: { role: "button", name: "Pay now" }, execute });
    await call(id);
    root.querySelector("#targeted")?.remove(); // the target matches nothing now: the marker is next
    await sleep(80);
    await call(id);
    root.querySelector("#marked")?.remove();
    await sleep(80);
    await call(id);
    expect(seen).toEqual(["targeted", "marked", "named"]);
  });

  it("takes a function target returning a locator, a selector or the element, called with the validated input", async () => {
    const id = uniqueName("t_remove");
    fixture(`
      <button id="row-a" type="button" aria-label="Remove Ocean Tee" data-row="a"></button>
      <button id="row-b" type="button" aria-label="Remove Field Mug" data-row="b"></button>
      <button id="row-c" type="button" aria-label="Remove Trail Cap" data-row="c"></button>`);
    const names: Record<string, string> = { a: "Ocean Tee", b: "Field Mug" };
    const seen: Array<string | undefined> = [];
    tool({
      id,
      inputSchema: z.object({ line: z.string().transform((line) => line.toLowerCase()), how: z.enum(["locator", "selector", "element"]) }),
      target: ({ line, how }) =>
        how === "locator"
          ? { role: "button", name: `Remove ${names[line]}` }
          : how === "selector"
            ? `[data-row="${line}"]`
            : document.getElementById(`row-${line}`),
      execute: () => void seen.push(pressed()),
    });
    await call(id, { line: "A", how: "locator" });
    await sleep(80);
    await call(id, { line: "B", how: "selector" });
    await sleep(80);
    await call(id, { line: "C", how: "element" });
    expect(seen).toEqual(["row-a", "row-b", "row-c"]);
  });

  it("awaits an async target that opens the UI its control lives in, then types into the field found there", async () => {
    const id = uniqueName("t_palette");
    const host = fixture('<button id="opener" type="button">Search</button><div id="slot"></div>');
    let opens = 0;
    let at: string | undefined;
    let typed: string | undefined;
    tool({
      id,
      title: "Search",
      inputSchema: z.object({ query: z.string() }),
      // Like a ⌘K palette: nothing is on the page until it opens, a frame later.
      target: () => {
        opens++;
        return new Promise<Element | null>((resolve) =>
          setTimeout(() => {
            host.querySelector("#slot")!.innerHTML = '<input id="palette" name="query" aria-label="Search the catalog">';
            resolve(byId("palette"));
          }, 30),
        );
      },
      execute: () => {
        at = pressed();
        typed = byId<HTMLInputElement>("palette").value;
      },
    });
    const res = await call(id, { query: "boots" });
    expect(resultText(res)).not.toMatch(/^Error/);
    expect(opens).toBe(1);
    expect(at).toBe("palette");
    expect(typed).toBe("boots");
    expect(rec.types()).toContain("fill");
  });

  it("goes on with the name when an async target never resolves", { timeout: OPEN_TARGET_MS + 5000 }, async () => {
    const id = uniqueName("t_never");
    fixture('<button id="named" type="button">Never opens</button>');
    let at: string | undefined;
    tool({
      id,
      title: "Never opens",
      target: () => new Promise<Element>(() => {}),
      execute: () => {
        at = pressed();
      },
    });
    const started = performance.now();
    await call(id);
    expect(performance.now() - started).toBeGreaterThanOrEqual(OPEN_TARGET_MS - 50);
    expect(at).toBe("named");
  });

  it("goes on with the name when an async target rejects, like a throwing one", async () => {
    const id = uniqueName("t_rejects");
    fixture('<button id="named" type="button">Rejects</button>');
    let at: string | undefined;
    tool({
      id,
      title: "Rejects",
      target: () => Promise.reject(new Error("the palette did not open")),
      execute: () => {
        at = pressed();
      },
    });
    const res = await call(id);
    expect(resultText(res)).not.toMatch(/^Error/);
    expect(at).toBe("named");
  });

  it("calls an async target only as a call starts, and each call keeps its own control", async () => {
    const id = uniqueName("t_rows");
    const host = fixture('<div id="slot"></div>');
    const opened: string[] = [];
    tool({
      id,
      title: "Open row",
      inputSchema: z.object({ row: z.string() }),
      target: async ({ row }: { row: string }) => {
        opened.push(row);
        await sleep(20);
        host.querySelector("#slot")!.insertAdjacentHTML("beforeend", `<button id="row-${row}" type="button">Row ${row}</button>`);
        return byId(`row-${row}`);
      },
      execute: () => {},
    });
    const results = await Promise.all([call(id, { row: "a" }), call(id, { row: "b" })]);
    for (const res of results) expect(resultText(res)).not.toMatch(/^Error/);
    expect(opened.sort()).toEqual(["a", "b"]);
    // looking a control up outside a call (the devtools, a run animated after the fact) never opens anything
    const { stages } = await import("./confirm");
    expect(stages.get(id)?.at({ row: "c" })).toBeNull();
    expect(opened.sort()).toEqual(["a", "b"]);
  });

  it("runs unseen when nothing matches, and says so once in the development console", async () => {
    const id = uniqueName("t_nowhere");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    tool({ id, title: "No such control", execute: () => "done" });
    const started = performance.now();
    expect(resultText(await call(id))).toBe("done");
    expect(performance.now() - started).toBeLessThan(150);
    await call(id);
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[0]).toMatch(new RegExp(`"${id}" runs unseen: nothing on the page matches "No such control"`));
    expect(rec.types()).toEqual(["start", "result", "start", "result"]);

    // a tool that only reads has nothing to show: no note
    const reader = uniqueName("t_reader");
    tool({ id: reader, readOnly: true, execute: () => "read" });
    await call(reader);
    expect(info).toHaveBeenCalledOnce();
  });

  it("points at the first match a person can use when a marker is duplicated", async () => {
    const id = uniqueName("t_dupe");
    fixture(
      `<button id="hidden-copy" type="button" toolname="${id}" style="display: none">Go</button><button id="shown" type="button" toolname="${id}">Go</button>`,
    );
    let at: string | undefined;
    tool({
      id,
      execute: () => {
        at = pressed();
      },
    });
    await call(id);
    expect(at).toBe("shown");
  });

  it("animates a tool that registered before the visuals installed to its own control", async () => {
    visuals?.destroy();
    const id = uniqueName("t_early");
    fixture('<button id="early" type="button">Refresh prices</button>');
    tool({ id, title: "Refresh prices", execute: () => "fresh" }); // registerTool is not wrapped yet
    visuals = installAgentVisuals({ linger: 50, yieldToUser: false });
    expect(resultText(await call(id))).toBe("fresh");
    await until(() => byId("early").hasAttribute("data-agent-active"), 3000, "the cursor on the control, after the fact");
  });

  // ---------- typing the call's values ----------

  it("types each value into its field before execute, with a fill event per field, in document order", async () => {
    const id = uniqueName("t_form");
    fixture(`
      <form>
        <label for="t-form-note">Gift note</label> <input id="t-form-note" type="text">
        <input id="t-form-qty" name="quantity" type="number" value="1">
        <button id="t-form-add" type="button">Add to cart</button>
      </form>`);
    const order: string[] = [];
    const inputs = { note: 0, qty: 0 };
    byId("t-form-note").addEventListener("input", () => inputs.note++);
    byId("t-form-qty").addEventListener("input", () => inputs.qty++);
    const stop = recordEvents();
    tool({
      id,
      title: "Add to cart",
      // the agent's argument order is not the page's
      inputSchema: z.object({ quantity: z.number().int().min(1), giftNote: z.string() }),
      execute: ({ quantity, giftNote }) => {
        order.push(`execute ${byId<HTMLInputElement>("t-form-qty").value} ${byId<HTMLInputElement>("t-form-note").value} at ${pressed()}`);
        return `Added ${quantity} with "${giftNote}"`;
      },
    });
    const res = await call(id, { quantity: 12, giftNote: "Enjoy" });
    stop.stop();
    expect(resultText(res)).toBe('Added 12 with "Enjoy"');
    expect(order).toEqual(["execute 12 Enjoy at t-form-add"]); // both on screen, then the press
    expect(rec.events.filter((e) => e.type === "fill")).toEqual([
      { type: "fill", tool: id, field: "giftNote", value: "Enjoy" },
      { type: "fill", tool: id, field: "quantity", value: "12" },
    ]);
    expect(rec.types()).toEqual(["start", "fill", "fill", "result"]);
    expect(inputs.note).toBe(5); // a text field is typed a character at a time
    expect(inputs.qty).toBe(1); // a number is written once: never 1, then 12
  });

  it("writes a select once, toggles a checkbox with a click and picks a radio by value", async () => {
    const id = uniqueName("t_kinds");
    fixture(`
      <form>
        <select id="t-kinds-size" name="size"><option value="s">S</option><option value="m">M</option></select>
        <label><input id="t-kinds-wrap" name="wrap" type="checkbox"> Gift wrap</label>
        <label><input id="t-kinds-news" name="news" type="checkbox" checked> Newsletter</label>
        <label><input id="t-kinds-std" name="speed" type="radio" value="standard" checked> Standard</label>
        <label><input id="t-kinds-fast" name="speed" type="radio" value="express"> Express</label>
        <input id="t-kinds-date" name="date" type="date">
        <button type="button">Save options</button>
      </form>`);
    const clicks: string[] = [];
    const changes: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[id^=t-kinds-]")) {
      el.addEventListener("click", () => clicks.push(el.id));
      el.addEventListener("change", () => changes.push(el.id));
    }
    tool({
      id,
      title: "Save options",
      inputSchema: z.object({ size: z.string(), wrap: z.boolean(), news: z.boolean(), speed: z.string(), date: z.string() }),
      execute: () => "saved",
    });
    await call(id, { size: "m", wrap: true, news: true, speed: "express", date: "2026-12-24" });
    expect(byId<HTMLSelectElement>("t-kinds-size").value).toBe("m");
    expect(byId<HTMLInputElement>("t-kinds-wrap").checked).toBe(true);
    expect(byId<HTMLInputElement>("t-kinds-news").checked).toBe(true);
    expect(byId<HTMLInputElement>("t-kinds-fast").checked).toBe(true);
    expect(byId<HTMLInputElement>("t-kinds-date").value).toBe("2026-12-24");
    // React hears a checkbox or radio through its click; one already in the wanted state is left alone
    expect(clicks).toEqual(["t-kinds-wrap", "t-kinds-fast"]);
    expect(changes).toEqual(["t-kinds-size", "t-kinds-wrap", "t-kinds-fast", "t-kinds-date"]);
  });

  it("visits a custom widget without writing it, then runs `fill` before the press", async () => {
    const id = uniqueName("t_widget");
    fixture(`
      <form>
        <span id="t-widget-label">Size</span>
        <div id="t-widget-size" role="combobox" aria-labelledby="t-widget-label" tabindex="0">S</div>
        <input id="t-widget-qty" name="quantity" type="number" value="1">
        <button id="t-widget-add" type="button">Add to bag</button>
      </form>`);
    const order: string[] = [];
    let visited = false;
    const watch = setInterval(() => {
      visited ||= !!document.querySelector(".agent-sr-only")?.textContent?.includes('size = "L"');
    }, 10);
    const off = recordEvents();
    const fills = (): number => off.events.filter((e) => e.type === "fill").length;
    tool({
      id,
      title: "Add to bag",
      inputSchema: z.object({ size: z.string(), quantity: z.number() }),
      fill: ({ size }) => {
        order.push(`fill after ${fills()} typed`);
        byId("t-widget-size").textContent = size; // what form.reset(values) does for a custom select
      },
      execute: () => void order.push(`execute with ${byId("t-widget-size").textContent}`),
    });
    await call(id, { size: "L", quantity: 3 });
    clearInterval(watch);
    off.stop();
    expect(visited).toBe(true);
    expect(order).toEqual(["fill after 1 typed", "execute with L"]);
    // only what was written is reported as filled
    expect(off.events.filter((e) => e.type === "fill")).toEqual([{ type: "fill", tool: id, field: "quantity", value: "3" }]);
  });

  it("skips a parameter with `fields: false` and one with no field, and follows an explicit field", async () => {
    const id = uniqueName("t_fields");
    fixture(`
      <header><input id="t-fields-search" aria-label="Search the store"></header>
      <form>
        <input id="t-fields-code" name="code">
        <button type="button">Apply filters</button>
      </form>`);
    let got: unknown;
    tool({
      id,
      title: "Apply filters",
      inputSchema: z.object({ code: z.string(), q: z.string(), page: z.number(), tags: z.array(z.string()) }),
      fields: { code: false, q: "Search the store" },
      execute: (input) => {
        got = input;
      },
    });
    await call(id, { code: "SAVE10", q: "tee", page: 2, tags: ["new"] });
    expect(byId<HTMLInputElement>("t-fields-code").value).toBe(""); // never typed
    expect(byId<HTMLInputElement>("t-fields-search").value).toBe("tee"); // outside the form: only because it was named
    expect(got).toEqual({ code: "SAVE10", q: "tee", page: 2, tags: ["new"] }); // execute still gets everything
    expect(rec.events.filter((e) => e.type === "fill")).toEqual([{ type: "fill", tool: id, field: "q", value: "tee" }]);
  });

  it("never types input the schema rejects: the agent gets the messages, the page is untouched", async () => {
    const id = uniqueName("t_invalid");
    fixture('<form><input id="t-invalid-qty" name="quantity" type="number" value="1"><button type="button">Add item</button></form>');
    const execute = vi.fn();
    tool({ id, title: "Add item", inputSchema: z.object({ quantity: z.number().int().min(1) }), execute });
    const res = await call(id, { quantity: 0 });
    expect(toolErrorCode(res)).toBe("invalid_input");
    expect(resultText(res)).toMatch(/quantity/);
    expect(byId<HTMLInputElement>("t-invalid-qty").value).toBe("1");
    expect(execute).not.toHaveBeenCalled();
    expect(rec.types()).not.toContain("fill");
  });

  it("still writes the values, in one step, under reduced motion", async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const id = uniqueName("t_reduced");
    fixture('<form><input id="t-reduced-note" name="note"><button type="button">Save note</button></form>');
    let inputs = 0;
    byId("t-reduced-note").addEventListener("input", () => inputs++);
    tool({
      id,
      title: "Save note",
      inputSchema: z.object({ note: z.string() }),
      execute: () => byId<HTMLInputElement>("t-reduced-note").value,
    });
    expect(resultText(await call(id, { note: "a long enough note" }))).toBe("a long enough note");
    expect(inputs).toBe(1);
  });

  it("still writes the values, at once, while the cursor has yielded to the user", async () => {
    visuals?.setYieldToUser({ resumeAfter: 5000 });
    const id = uniqueName("t_yielded");
    const root = fixture(
      '<form><input id="t-yielded-note" name="note"><button type="button">Send note</button></form><p id="elsewhere">text</p>',
    );
    tool({
      id,
      title: "Send note",
      inputSchema: z.object({ note: z.string() }),
      execute: () => byId<HTMLInputElement>("t-yielded-note").value,
    });
    await userEvent.click(root.querySelector("#elsewhere") as Element); // a person is using the page
    const started = performance.now();
    expect(resultText(await call(id, { note: "typed while the user is busy" }))).toBe("typed while the user is busy");
    expect(performance.now() - started).toBeLessThan(250);
    expect(rec.types()).toContain("fill");
  });

  it("writes the values in one step with no visuals at all, runs `fill`, then execute", async () => {
    visuals?.destroy();
    visuals = null;
    const id = uniqueName("t_bare");
    fixture(`
      <form>
        <input id="t-bare-note" name="note">
        <label><input id="t-bare-wrap" name="wrap" type="checkbox"> Wrap</label>
        <button type="button">Keep note</button>
      </form>`);
    const order: string[] = [];
    byId("t-bare-note").addEventListener("input", () => order.push("input"));
    byId("t-bare-wrap").addEventListener("click", () => order.push("click"));
    tool({
      id,
      title: "Keep note",
      inputSchema: z.object({ note: z.string(), wrap: z.boolean() }),
      fill: () => void order.push("fill"),
      execute: () => void order.push(`execute ${byId<HTMLInputElement>("t-bare-note").value}`),
    });
    await call(id, { note: "hello", wrap: true });
    expect(order).toEqual(["input", "click", "fill", "execute hello"]);
    expect(document.querySelector(".agent-cursor")).toBeNull();
  });

  it("reports a throwing `fill` as the call's failure and never runs execute", async () => {
    const id = uniqueName("t_fill_throws");
    fixture('<button type="button">Break things</button>');
    const execute = vi.fn();
    tool({
      id,
      title: "Break things",
      fill: () => {
        throw new Error("the form is gone");
      },
      execute,
    });
    const res = await call(id);
    expect(resultText(res)).toBe("Error [failed]: the form is gone");
    expect(execute).not.toHaveBeenCalled();
  });

  // ---------- confirmation ----------

  it("types, fills, then parks on the single control named like the tool, and runs only on the person's own click", async () => {
    const id = uniqueName("t_checkout");
    fixture(`
      <form>
        <input id="t-checkout-email" name="email" type="email">
        <button id="t-checkout-place" type="button">Place order</button>
      </form>`);
    const order: string[] = [];
    const pageHandler = vi.fn();
    byId("t-checkout-place").addEventListener("click", pageHandler);
    const off = recordEvents();
    const seen = (): string => off.events.map((e) => e.type).join(" ");
    tool({
      id,
      title: "Place order",
      requireConfirmation: true,
      inputSchema: z.object({ email: z.string() }),
      fill: () => void order.push(`fill after: ${seen()}`),
      execute: () => {
        order.push(`execute after: ${seen()}`);
        return "placed";
      },
    });
    const pending = call(id, { email: "a@b.co" });
    await until(() => !!document.querySelector(".agent-cursor.is-waiting"), 4000, "the cursor parked");
    expect(document.querySelector(".agent-tag")?.textContent).toBe('Click "Place order" to confirm');
    expect(byId<HTMLInputElement>("t-checkout-email").value).toBe("a@b.co"); // on screen before they confirm

    byId("t-checkout-place").click(); // a script is not the person: its click is the page's own business
    await sleep(100);
    expect(order).toHaveLength(1);
    expect(pageHandler).toHaveBeenCalledOnce();
    pageHandler.mockClear();

    await userEvent.click(byId("t-checkout-place"));
    expect(resultText(await pending)).toBe("placed");
    off.stop();
    expect(order).toEqual(["fill after: start fill", "execute after: start fill park"]);
    expect(pageHandler).not.toHaveBeenCalled(); // the tool's execute is the single source of the action
  });

  it("fails closed when no control matches a confirm-gated tool", async () => {
    const id = uniqueName("t_no_control");
    const execute = vi.fn();
    tool({ id, title: "Delete account", requireConfirmation: true, execute });
    const res = await call(id);
    expect(toolErrorCode(res)).toBe("unavailable");
    expect(resultText(res)).toMatch(/nothing to confirm on \("Delete account"\)/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed, with a hint, when several controls match a confirm-gated tool; an ordinary tool takes the first", async () => {
    const gatedId = uniqueName("t_two_gated");
    const plainId = uniqueName("t_two_plain");
    fixture('<button id="first" type="button">Add to cart</button><button id="second" type="button">Add to cart</button>');
    const execute = vi.fn();
    tool({ id: gatedId, title: "Add to cart", requireConfirmation: true, execute });
    const res = await call(gatedId);
    expect(toolErrorCode(res)).toBe("unavailable");
    expect(resultText(res)).toMatch(/2 controls match "Add to cart"\. Set a `target` that picks one\./);
    expect(execute).not.toHaveBeenCalled();

    let at: string | undefined;
    tool({
      id: plainId,
      title: "Add to cart",
      execute: () => {
        at = pressed();
      },
    });
    await sleep(80);
    await call(plainId);
    expect(at).toBe("first");
  });

  it("stops waiting when a second matching control appears while parked", async () => {
    const id = uniqueName("t_second_appears");
    const root = fixture('<button type="button">Empty trash</button>');
    tool({ id, title: "Empty trash", requireConfirmation: true, execute: () => "emptied" });
    const pending = call(id);
    await until(() => rec.types().includes("park"), 3000, "park");
    root.insertAdjacentHTML("beforeend", '<button type="button">Empty trash</button>');
    expect(resultText(await pending)).toMatch(/2 controls match "Empty trash"/);
  });

  // ---------- invoke ----------

  it("invoke() calls the tool as an agent would and resolves to what execute returned", async () => {
    const id = uniqueName("t_invoke");
    fixture(
      '<form><input id="t-invoke-qty" name="quantity" type="number"><button id="t-invoke-add" type="button">Add to basket</button></form>',
    );
    const cart = { lines: [{ sku: "tee", quantity: 2 }] };
    let at: string | undefined;
    const add = tool<{ quantity: number }>({
      id,
      title: "Add to basket",
      inputSchema: z.object({ quantity: z.number() }),
      execute: () => {
        at = pressed();
        return cart;
      },
    });
    const out = await add.invoke({ quantity: 2 });
    expect(out).toBe(cart); // the value itself, not its JSON text
    expect(at).toBe("t-invoke-add"); // through the page: the cursor pressed the button
    expect(byId<HTMLInputElement>("t-invoke-qty").value).toBe("2");
    expect(rec.types()).toEqual(["start", "fill", "result"]);
  });

  it("invoke() rejects with the agent's error code, and when the tool is not on the page", async () => {
    const id = uniqueName("t_invoke_fails");
    const failing = tool<{ n: number }>({
      id,
      inputSchema: z.object({ n: z.number() }),
      readOnly: true,
      execute: () => {
        throw new WebToolError("needs_user", "Sign in first");
      },
    });
    const refused = await failing.invoke({ n: 1 }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(WebToolError);
    expect(refused).toMatchObject({ code: "needs_user", message: "Sign in first" });
    await expect(failing.invoke({ n: "x" as never })).rejects.toMatchObject({ code: "invalid_input" });

    const absent = defineWebTool({ id: uniqueName("t_invoke_absent"), description: "d", execute: () => "x" });
    await expect(absent.invoke()).rejects.toThrow(/Unknown tool/);
    const ac = new AbortController();
    ac.abort();
    await expect(failing.invoke({ n: 1 }, { signal: ac.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("a registration from a function reads execute, target and fill from the latest definition", async () => {
    const id = uniqueName("t_latest");
    fixture('<button id="t-latest-a" type="button">Alpha</button><button id="t-latest-b" type="button">Beta</button>');
    const seen: string[] = [];
    const version = (name: string): WebTool =>
      defineWebTool({
        id,
        description: "same definition, new closure",
        target: () => ({ role: "button", name }),
        fill: () => void seen.push(`fill ${name}`),
        execute: () => void seen.push(`execute ${name} at ${pressed()}`),
      }) as WebTool;
    let latest = version("Alpha");
    const changes = vi.fn();
    modelContext().addEventListener("toolchange", changes);
    offs.push(registerWebTool(() => latest));
    await call(id);
    latest = version("Beta");
    await sleep(80);
    await call(id);
    modelContext().removeEventListener("toolchange", changes);
    expect(seen).toEqual(["fill Alpha", "execute Alpha at t-latest-a", "fill Beta", "execute Beta at t-latest-b"]);
    expect(changes).toHaveBeenCalledOnce(); // registered once
  });
});
