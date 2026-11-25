import { createWebAgents, defineWebTool, registerWebTool, type WebTool } from "@webmcp-agents/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDevtoolsStore, type DevtoolsStore, type ToolView } from "./store";
import { byText, cleanupFixtures, uiRoot, fixture, modelContext, uniqueName, until } from "@webmcp-agents/testing";
import { installWebAgentsDevtools } from "./vanilla";

const qtySchema = { type: "object", properties: { qty: { type: "number" } } } as const;

describe("devtools: where a tool acts", () => {
  let store: DevtoolsStore;
  const offs: Array<() => void> = [];
  const register = (tool: WebTool): WebTool => {
    offs.push(registerWebTool(tool));
    return tool;
  };
  const view = async (id: string, check: (t: ToolView) => boolean = () => true): Promise<ToolView> => {
    await until(() => store.getSnapshot().tools.some((t) => t.name === id && check(t)), 3000, `${id} listed`);
    return store.getSnapshot().tools.find((t) => t.name === id)!;
  };

  beforeEach(() => {
    localStorage.clear();
    modelContext();
    store = createDevtoolsStore();
  });
  afterEach(() => {
    for (const off of offs.splice(0)) off();
    store.destroy();
    cleanupFixtures();
  });

  it("found: the control by its title, the field by its label, and Locate goes to that control", async () => {
    fixture(`<form><label>Qty <input name="qty" type="number"></label> <button type="button">Add to cart</button></form>`);
    const tool = register(
      defineWebTool({
        id: uniqueName("add_to_cart"),
        title: "Add to cart",
        description: "Add.",
        inputSchema: qtySchema,
        execute: () => "ok",
      }),
    );
    const t = await view(tool.id, (v) => v.control?.count === 1);
    expect(t).toMatchObject({
      registered: true,
      onScreen: true,
      fits: true,
      control: { by: "name", count: 1, label: "button · Add to cart", warn: false },
      fields: [{ name: "qty", field: "spinbutton · Qty" }],
    });
    expect(t.match).toBeUndefined();
    // Locate uses the same resolver: no toolname marker on the page
    expect(store.locate(tool.id)).toBe(true);
    expect(document.querySelector("button")!.hasAttribute("data-web-agents-locate")).toBe(true);
  });

  it("none: an ordinary tool runs unseen; a confirm-gated one says its confirmation fails", async () => {
    const plain = register(defineWebTool({ id: uniqueName("refresh_feed"), description: "Refresh.", execute: () => "ok" }));
    const gated = register(
      defineWebTool({ id: uniqueName("delete_all"), description: "Delete.", requireConfirmation: true, execute: () => "ok" }),
    );
    expect((await view(plain.id)).control).toEqual({ by: "name", count: 0, label: "none: runs unseen", warn: false });
    const g = await view(gated.id);
    expect(g.control).toEqual({ by: "name", count: 0, label: "none: confirmation fails", warn: true });
    expect(g).toMatchObject({ onScreen: false, confirms: true });
    expect(store.locate(plain.id)).toBe(false);
  });

  it("ambiguous: several controls with the name are counted, and a warning for a confirm-gated tool", async () => {
    fixture(
      `<button type="button">Remove item</button><button type="button">Remove item</button><button type="button">Remove item</button>`,
    );
    const plain = register(
      defineWebTool({ id: uniqueName("remove_item"), title: "Remove item", description: "Remove.", execute: () => "ok" }),
    );
    const gated = register(
      defineWebTool({
        id: uniqueName("remove_item"),
        title: "Remove item",
        description: "Remove.",
        requireConfirmation: true,
        execute: () => "ok",
      }),
    );
    expect((await view(plain.id, (v) => v.control?.count === 3)).control).toEqual({
      by: "name",
      count: 3,
      label: "3 matches",
      warn: false,
    });
    expect((await view(gated.id, (v) => v.control?.count === 3)).control).toMatchObject({ label: "3 matches", warn: true });
    // a locator target is a name too; a selector accepts a click on any match
    const byLocator = register(
      defineWebTool({
        id: uniqueName("remove_item"),
        description: "Remove.",
        target: { role: "button", name: "Remove item" },
        requireConfirmation: true,
        execute: () => "ok",
      }),
    );
    const bySelector = register(
      defineWebTool({
        id: uniqueName("remove_item"),
        description: "Remove.",
        target: "button",
        requireConfirmation: true,
        execute: () => "ok",
      }),
    );
    expect((await view(byLocator.id, (v) => v.control?.count === 3)).control).toMatchObject({ by: "target", warn: true });
    expect((await view(bySelector.id, (v) => (v.control?.count ?? 0) >= 3)).control).toMatchObject({ by: "target", warn: false });
  });

  it("a target: a locator, a selector, and a function target that depends on the call", async () => {
    fixture(`<button type="button" aria-label="Empty the cart">🗑</button><a href="#x" id="promo">Promo</a>`);
    const byLocator = register(
      defineWebTool({
        id: uniqueName("clear_cart"),
        description: "Clear.",
        target: { role: "button", name: "Empty the cart" },
        execute: () => "ok",
      }),
    );
    const bySelector = register(
      defineWebTool({ id: uniqueName("open_promo"), description: "Promo.", target: "#promo", execute: () => "ok" }),
    );
    const perCall = register(
      defineWebTool({ id: uniqueName("remove_line"), description: "Remove.", target: () => ({ role: "button" }), execute: () => "ok" }),
    );
    expect((await view(byLocator.id, (v) => v.control?.count === 1)).control).toMatchObject({
      by: "target",
      label: "button · Empty the cart",
    });
    expect((await view(bySelector.id, (v) => v.control?.count === 1)).control).toMatchObject({ by: "target", label: "link · Promo" });
    expect((await view(perCall.id)).control).toEqual({ by: "call", count: 0, label: "depends on the call", warn: false });
  });

  it("follows the page: a control rendered later is found without a tool change", async () => {
    const tool = register(defineWebTool({ id: uniqueName("open_cart"), title: "Open cart", description: "Open.", execute: () => "ok" }));
    expect((await view(tool.id)).control?.count).toBe(0);
    fixture(`<button type="button">Open cart</button>`);
    expect((await view(tool.id, (v) => v.control?.count === 1)).control?.label).toBe("button · Open cart");
  });

  it("match: a catalog tool is listed off here until the path fits, then on", async () => {
    const start = location.href;
    const path = `/devtools-match-${uniqueName("p")}`;
    const tool = defineWebTool({
      id: uniqueName("list_orders"),
      description: "Orders.",
      match: [path, "/elsewhere"],
      readOnly: true,
      execute: () => "[]",
    });
    const agents = createWebAgents({ tools: { listOrders: tool }, visuals: false });
    store.refreshTools(); // nothing registered, so no toolchange: in an app the devtools mount after the provider
    try {
      const off = await view(tool.id);
      expect(off).toMatchObject({ registered: false, fits: false, match: `${path}, /elsewhere` });
      history.pushState(null, "", path);
      const on = await view(tool.id, (v) => v.registered);
      expect(on).toMatchObject({ registered: true, fits: true });
      history.pushState(null, "", "/somewhere-else");
      expect(await view(tool.id, (v) => !v.registered)).toMatchObject({ fits: false });
    } finally {
      agents.destroy();
      history.replaceState(null, "", start);
    }
  });

  it("flags as badges, from the tool's flags or its annotations", async () => {
    const tool = register(
      defineWebTool({
        id: uniqueName("get_reviews"),
        description: "Reviews.",
        readOnly: true,
        external: true,
        safeResponse: false,
        annotations: { idempotentHint: true },
        execute: () => "[]",
      }),
    );
    const t = await view(tool.id);
    expect(t.flags.map((f) => f.label)).toEqual(["read-only", "repeatable", "external", "untrusted answer"]);
    const wipe = register(defineWebTool({ id: uniqueName("wipe"), description: "Wipe.", destructive: true, execute: () => "ok" }));
    expect((await view(wipe.id)).flags).toEqual([expect.objectContaining({ flag: "destructive", label: "destructive", warn: true })]);
  });

  it("window.agent.invoke calls a tool; run is the same function", async () => {
    const tool = register(
      defineWebTool({
        id: uniqueName("echo"),
        description: "Echo.",
        inputSchema: qtySchema,
        execute: ({ qty }: { qty: number }) => `got ${qty}`,
      }),
    );
    await view(tool.id);
    expect(await window.agent?.invoke(tool.id, { qty: 2 })).toEqual({ content: [{ type: "text", text: "got 2" }] });
    expect(window.agent?.run).toBe(window.agent?.invoke);
    expect(store.getSnapshot().calls[0]).toMatchObject({ tool: tool.id, origin: "devtools", status: "ok" });
  });
});

describe("devtools panel: the resolved control", () => {
  it("shows the control, the fields, the match and the flag badges in the tool's row", async () => {
    localStorage.clear();
    modelContext();
    fixture(`<label>Quantity <input name="quantity" type="number"></label><button type="button">Add to basket</button>`);
    const tool = defineWebTool({
      id: uniqueName("add_to_basket"),
      title: "Add to basket",
      description: "Add.",
      inputSchema: { type: "object", properties: { quantity: { type: "number" }, note: { type: "string" } } },
      readOnly: false,
      repeatable: true,
      execute: () => "ok",
    });
    const off = registerWebTool(tool);
    const dispose = installWebAgentsDevtools({ eventClient: false });
    try {
      await until(() => !!document.querySelector("[data-web-agents-ui]")?.shadowRoot?.querySelector(".launcher"), 3000, "launcher");
      (uiRoot("devtools").querySelector(".launcher") as HTMLElement).click();
      await until(() => !!byText(uiRoot("devtools"), ".disclosure", tool.id), 3000, "row");
      const row = byText(uiRoot("devtools"), ".disclosure", tool.id)!.closest(".tool")!;
      const resolved = row.querySelector(".resolved")!;
      expect(resolved.textContent).toContain("Controlbutton · Add to basket");
      expect(resolved.textContent).toContain("quantity → spinbutton · Quantity");
      expect(resolved.textContent).toContain("note → not typed");
      expect([...row.querySelectorAll(".badge")].map((b) => b.textContent)).toEqual(["imperative", "repeatable"]);
    } finally {
      dispose();
      off();
      cleanupFixtures();
    }
  });
});
