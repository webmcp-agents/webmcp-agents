import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanupFixtures, fixture, modelContext, uniqueName } from "@webmcp-agents/testing";
import { createWebAgents, inspectTools } from "./web-agents";
import { defineWebTool, registerWebTool } from "./web-tool";

const find = (id: string) => inspectTools().find((t) => t.tool.id === id);

describe("inspectTools", () => {
  beforeAll(() => modelContext());
  afterEach(() => cleanupFixtures());

  it("a registered tool: its control by name, each parameter's field, how it was found", () => {
    fixture(`<label>Quantity <input name="quantity" type="number"></label><button type="button">Add to cart</button>`);
    const tool = defineWebTool({
      id: uniqueName("add_to_cart"),
      title: "Add to cart",
      description: "Add.",
      inputSchema: { type: "object", properties: { quantity: { type: "number" }, note: { type: "string" }, size: { type: "string" } } },
      fields: { size: false },
      execute: () => "ok",
    });
    const off = registerWebTool(tool);
    const seen = find(tool.id)!;
    expect(seen.by).toBe("name");
    expect(seen.controls).toEqual([document.querySelector("button")]);
    expect(seen.fields).toEqual([
      { name: "quantity", field: document.querySelector("input") },
      { name: "note", field: null },
      { name: "size", field: null },
    ]);
    expect(seen.fits).toBe(true);
    off();
    expect(find(tool.id)).toBeUndefined(); // released, and in no catalog
  });

  it("a target, a toolname marker, a function target, and no control", () => {
    fixture(`<a href="#promo" id="promo">Promo</a><div toolname="marked_one">x</div>`);
    const offs = [
      registerWebTool(defineWebTool({ id: uniqueName("by_target"), description: "t", target: "#promo", execute: () => "" })),
      registerWebTool(defineWebTool({ id: "marked_one", description: "m", execute: () => "" })),
      registerWebTool(defineWebTool({ id: uniqueName("per_call"), description: "c", target: () => "#promo", execute: () => "" })),
      registerWebTool(defineWebTool({ id: uniqueName("nowhere"), description: "n", execute: () => "" })),
    ];
    const [target, marker, call, none] = inspectTools().slice(-4);
    expect([target!.by, target!.controls.length]).toEqual(["target", 1]);
    expect([marker!.by, marker!.controls.length]).toEqual(["marker", 1]);
    expect([call!.by, call!.controls.length]).toEqual(["call", 0]);
    expect([none!.by, none!.controls.length]).toEqual(["name", 0]);
    for (const off of offs) off();
  });

  it("a catalog tool whose match does not fit is listed, not fitting; destroyed, it is gone", () => {
    const tool = defineWebTool({ id: uniqueName("list_orders"), description: "o", match: "/nowhere-near", execute: () => "" });
    const agents = createWebAgents({ tools: { listOrders: tool }, visuals: false });
    expect(find(tool.id)).toMatchObject({ fits: false, by: "name", controls: [] });
    agents.destroy();
    expect(find(tool.id)).toBeUndefined();
  });
});
