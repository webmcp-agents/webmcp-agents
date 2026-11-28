import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { fixture as mount, uniqueName as unique } from "@webmcp-agents/testing";
import { installWebMCPPolyfill } from "./index";

const mc = installWebMCPPolyfill() as ModelContext;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A form that answers agent submits with `answer` and never navigates. */
function answering(form: HTMLFormElement, answer = "ok"): HTMLFormElement {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const ev = e as SubmitEvent;
    if (ev.agentInvoked) ev.respondWith?.(Promise.resolve(answer));
  });
  return form;
}

const tool = async (name: string) => (await mc.getTools()).find((t) => t.name === name);
const text = (res: unknown) => ((res as ModelContextToolResult).content ?? []).map((c) => c.text).join(" ");

afterEach(() => {
  for (const el of document.querySelectorAll(".test-fixture")) el.remove();
});

describe("installWebMCPPolyfill", () => {
  it("installs once and returns the same object", () => {
    expect(document.modelContext).toBe(mc);
    expect(installWebMCPPolyfill()).toBe(mc);
  });
});

describe("declarative forms", () => {
  it("derives the input schema from the form controls", async () => {
    const name = unique("schema");
    mount(`
      <form toolname="${name}" tooldescription="Book it">
        <label>Quantity <input name="qty" type="number" min="1" max="20" required></label>
        <input name="price" type="number" step="0.5">
        <label>Notes <input name="note" toolparamdescription="Anything else"></label>
        <select name="size"><option value="s">S</option><option value="m">M</option></select>
        <input name="gift" type="checkbox">
        <button type="submit">Go</button>
      </form>`);
    await tick();

    const info = await tool(name);
    expect(info?.description).toBe("Book it");
    const schema = info?.inputSchema as { properties: Record<string, Record<string, unknown>>; required: string[] };
    expect(schema.properties.qty).toEqual({ type: "integer", minimum: 1, maximum: 20, description: "Quantity" });
    expect(schema.properties.price?.type).toBe("number");
    expect(schema.properties.note?.description).toBe("Anything else"); // toolparamdescription wins over <label>
    expect(schema.properties.size).toMatchObject({ type: "string", enum: ["s", "m"] });
    expect(schema.properties.gift?.type).toBe("boolean");
    expect(schema.required).toEqual(["qty"]);
  });

  it("unregisters a form when it is removed", async () => {
    const name = unique("removed");
    const root = mount(`<form toolname="${name}"><button>Go</button></form>`);
    await tick();
    expect(await tool(name)).toBeDefined();

    let changed = 0;
    const onChange = () => changed++;
    mc.addEventListener("toolchange", onChange);
    root.remove();
    await tick();
    mc.removeEventListener("toolchange", onChange);
    expect(await tool(name)).toBeUndefined();
    expect(changed).toBeGreaterThan(0);
  });

  it("keeps a tool registered when its form is remounted (new form added before the old one is removed)", async () => {
    const name = unique("remount");
    const old = mount(`<form toolname="${name}"><button>Go</button></form>`);
    await tick();
    mount(`<form toolname="${name}"><button>Go</button></form>`);
    await tick();
    old.remove();
    await tick();
    expect(await tool(name)).toBeDefined();
  });

  it("fills and submits an autosubmit form, accepting Chrome's (tool, JSON string) call shape", async () => {
    const name = unique("auto");
    const form = answering(
      mount(`<form toolname="${name}" toolautosubmit><input name="qty" type="number"><button>Go</button></form>`).querySelector(
        "form",
      ) as HTMLFormElement,
      "added",
    );
    await tick();

    const info = await tool(name);
    const res = await mc.executeTool(info as ModelContextToolInfo, '{"qty":2}');
    expect(text(res)).toBe("added");
    expect((form.elements.namedItem("qty") as HTMLInputElement).value).toBe("2");
  });

  it("pauses a form without toolautosubmit until the user clicks submit", async () => {
    const name = unique("confirm");
    const form = answering(
      mount(`<form toolname="${name}"><button type="submit">Place order</button></form>`).querySelector("form") as HTMLFormElement,
      "placed",
    );
    await tick();

    let settled = false;
    const pending = mc.executeTool(name, {}).then((r) => {
      settled = true;
      return r;
    });
    await tick();
    const button = form.querySelector("button") as HTMLButtonElement;
    expect(button.hasAttribute("data-tool-submit-active")).toBe(true);
    expect(form.hasAttribute("data-tool-form-active")).toBe(true);
    expect(settled).toBe(false);

    await userEvent.click(button);
    expect(text(await pending)).toBe("placed");
    expect(button.hasAttribute("data-tool-submit-active")).toBe(false);
    expect(form.hasAttribute("data-tool-form-active")).toBe(false);
  });

  it("cancels a paused call with an AbortError and a toolcancel event", async () => {
    const name = unique("cancel");
    mount(`<form toolname="${name}"><button type="submit">Go</button></form>`);
    await tick();

    const cancelled: string[] = [];
    const onCancel = (e: Event) => cancelled.push((e as ToolEvent).toolName);
    mc.addEventListener("toolcancel", onCancel);
    const pending = mc.executeTool(name, {}).catch((e: unknown) => e);
    await tick();
    expect(mc.cancelTool?.(name)).toBe(true);
    const err = await pending;
    mc.removeEventListener("toolcancel", onCancel);

    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
    expect(cancelled).toEqual([name]);
  });

  it("cancels a paused call when the caller aborts executeTool's signal, as in Chrome", async () => {
    const name = unique("signal");
    const form = mount(`<form toolname="${name}"><button type="submit">Go</button></form>`);
    await tick();

    const cancelled: string[] = [];
    const onCancel = (e: Event) => cancelled.push((e as ToolEvent).toolName);
    mc.addEventListener("toolcancel", onCancel);
    const controller = new AbortController();
    const pending = mc.executeTool(name, {}, { signal: controller.signal }).catch((e: unknown) => e);
    await tick();
    controller.abort();
    const err = await pending;
    mc.removeEventListener("toolcancel", onCancel);

    expect((err as DOMException).name).toBe("AbortError");
    expect(cancelled).toEqual([name]);
    expect(form.querySelector("button")?.hasAttribute("data-tool-submit-active")).toBe(false);
  });

  it("fails a paused call with a readable answer when its form leaves the page", async () => {
    const name = unique("gone");
    const form = mount(`<form toolname="${name}"><button type="submit">Go</button></form>`);
    await tick();

    const cancelled: string[] = [];
    const onCancel = (e: Event) => cancelled.push((e as ToolEvent).toolName);
    mc.addEventListener("toolcancel", onCancel);
    const pending = mc.executeTool(name, {});
    await tick();
    form.remove();
    const result = await pending;
    mc.removeEventListener("toolcancel", onCancel);

    expect((result as ModelContextToolResult).isError).toBe(true);
    expect(text(result)).toMatch(/left the page before the user confirmed/);
    expect(cancelled).toEqual([name]);
  });
});

describe("imperative tools", () => {
  it("registers, executes with a normalised result, and unregisters on abort", async () => {
    const name = unique("imp");
    const ac = new AbortController();
    mc.registerTool({ name, description: "echo", execute: (args) => `got ${JSON.stringify(args)}` }, { signal: ac.signal });

    expect(text(await mc.executeTool(name, { a: 1 }))).toBe('got {"a":1}');
    ac.abort();
    expect(await tool(name)).toBeUndefined();
  });

  it("turns a throwing execute into an error result", async () => {
    const name = unique("throws");
    mc.registerTool({
      name,
      execute: () => {
        throw new Error("nope");
      },
    });
    const res = (await mc.executeTool(name, {})) as ModelContextToolResult;
    mc.unregisterTool?.(name);
    expect(res.isError).toBe(true);
    expect(text(res)).toBe("nope");
  });
});
