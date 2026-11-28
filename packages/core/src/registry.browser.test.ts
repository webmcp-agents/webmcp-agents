import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createToolRegistry, type ToolRegistry } from "./registry";
import { modelContext, resultText, uniqueName, until } from "@webmcp-agents/testing";
import { defineWebTool, type WebTool } from "./web-tool";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const names = async (): Promise<string[]> => (await modelContext().getTools()).map((t) => t.name);
const tool = (id: string, extra: Partial<Parameters<typeof defineWebTool>[0]> = {}): WebTool =>
  defineWebTool({ id, description: "test tool", execute: () => `${id} ran`, ...extra });

/** Count `toolchange` events from now on. */
function countChanges(): { count: () => number; stop: () => void } {
  let n = 0;
  const onChange = () => n++;
  modelContext().addEventListener("toolchange", onChange);
  return { count: () => n, stop: () => modelContext().removeEventListener("toolchange", onChange) };
}

describe("createToolRegistry", () => {
  let registry: ToolRegistry | null = null;
  beforeAll(() => modelContext());
  afterEach(() => {
    registry?.destroy();
    registry = null;
  });

  it("keeps a tool registered while anyone holds it", async () => {
    const a = uniqueName("r_a");
    registry = createToolRegistry([tool(a)]);
    registry.enable([a]);
    const second = registry.enable([a]);
    second();
    second(); // idempotent
    await sleep(20);
    expect(await names()).toContain(a);
    expect(registry.enabled()).toEqual([a]);
  });

  it("unregisters once the last holder releases", async () => {
    const a = uniqueName("r_a");
    registry = createToolRegistry([tool(a)]);
    const listener = vi.fn();
    registry.subscribe(listener);
    const off = registry.enable([a]);
    expect(await names()).toContain(a);
    off();
    expect(await names()).toContain(a); // not synchronously
    await sleep(20);
    expect(await names()).not.toContain(a);
    expect(registry.enabled()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("never touches WebMCP for a release + re-enable in the same tick", async () => {
    const a = uniqueName("r_a");
    registry = createToolRegistry([tool(a)]);
    const off = registry.enable([a]);
    const changes = countChanges();
    off();
    registry.enable([a]);
    await sleep(20);
    changes.stop();
    expect(changes.count()).toBe(0);
    expect(await names()).toContain(a);
  });

  it("keeps a tool with a call in flight until it settles and the answer is delivered", async () => {
    const a = uniqueName("r_slow");
    let finish!: (v: string) => void;
    registry = createToolRegistry([tool(a, { execute: () => new Promise<string>((r) => (finish = r)) })]);
    const off = registry.enable([a]);
    const call = modelContext().executeTool(a, {});
    await sleep(0);
    off();
    await sleep(100);
    expect(await names()).toContain(a);
    finish("done");
    expect(resultText(await call)).toBe("done");
    await sleep(300);
    expect(await names()).toContain(a); // still within the answer grace
    await until(() => !registry?.enabled().includes(a), 1500, "release after grace");
    expect(await names()).not.toContain(a);
  });

  it("re-registers on update only when the definition changed", async () => {
    const a = uniqueName("r_a");
    registry = createToolRegistry([tool(a)]);
    registry.enable([a]);
    const changes = countChanges();
    registry.update([tool(a, { execute: () => "new execute" })]);
    expect(changes.count()).toBe(0);
    expect(resultText(await modelContext().executeTool(a, {}))).toBe("new execute"); // latest execute without re-registering
    registry.update([tool(a, { description: "changed" })]);
    expect(changes.count()).toBe(2); // unregister + register
    changes.stop();
    expect((await modelContext().getTools()).find((t) => t.name === a)?.description).toBe("changed");
  });

  it("holds an id the catalog doesn't have yet, and registers it when an update adds it", async () => {
    const a = uniqueName("r_late");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry = createToolRegistry([]);
    const off = registry.enable([a]);
    warn.mockRestore();
    expect(await names()).not.toContain(a);
    registry.update([tool(a)]);
    expect(await names()).toContain(a);
    off();
    await sleep(20);
    expect(await names()).not.toContain(a);
  });

  it("releases tools that leave the catalog", async () => {
    const a = uniqueName("r_a");
    registry = createToolRegistry([tool(a)]);
    registry.enable([a]);
    registry.update([]);
    await sleep(20);
    expect(await names()).not.toContain(a);
  });

  it("passes options.context() to execute as ctx.context", async () => {
    const a = uniqueName("r_ctx");
    let state = "first";
    registry = createToolRegistry([tool(a, { execute: (_i, ctx) => String(ctx.context) })], { context: () => state });
    registry.enable([a]);
    expect(resultText(await modelContext().executeTool(a, {}))).toBe("first");
    state = "second";
    expect(resultText(await modelContext().executeTool(a, {}))).toBe("second");
  });

  it("calls beforeRegister before the first registration only", () => {
    const a = uniqueName("r_a");
    const beforeRegister = vi.fn();
    registry = createToolRegistry([tool(a)], { beforeRegister });
    expect(beforeRegister).not.toHaveBeenCalled();
    registry.enable([a]);
    registry.enable([a]);
    expect(beforeRegister).toHaveBeenCalledOnce();
  });

  it("warns about unknown names with the catalog, and throws on duplicate ids", () => {
    const a = uniqueName("r_a");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry = createToolRegistry([tool(a)]);
    registry.enable(["nope"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Unknown tool "nope". Catalog: ${a}`));
    warn.mockRestore();
    expect(() => createToolRegistry([tool(a), tool(a)])).toThrow(`Duplicate WebTool id "${a}"`);
  });

  it("destroy() unregisters everything at once", async () => {
    const a = uniqueName("r_a");
    registry = createToolRegistry([tool(a)]);
    registry.enable([a]);
    registry.destroy();
    expect(await names()).not.toContain(a);
  });
});
