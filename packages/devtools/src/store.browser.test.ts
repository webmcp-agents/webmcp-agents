import { type AgentVisuals, installAgentVisuals, type ModelContextExecuteOptions } from "@webmcp-agents/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { createDevtoolsStore, type DevtoolsStore } from "./store";
import { cleanupFixtures, modelContext, toolForm, uniqueName, until } from "@webmcp-agents/testing";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createDevtoolsStore", () => {
  let visuals: AgentVisuals;
  let store: DevtoolsStore;

  beforeEach(() => {
    localStorage.clear();
    modelContext();
    visuals = installAgentVisuals({ linger: 20, yieldToUser: false });
    store = createDevtoolsStore();
  });

  afterEach(() => {
    store.destroy();
    visuals.destroy();
    cleanupFixtures();
  });

  const call = (tool: string) => store.getSnapshot().calls.find((c) => c.tool === tool);

  it("lists tools with their kind and whether they are on screen", async () => {
    const name = uniqueName("add_to_cart_x");
    toolForm(name);
    await until(() => store.getSnapshot().tools.some((t) => t.name === name), 3000, "tool listed");
    const tool = store.getSnapshot().tools.find((t) => t.name === name);
    expect(tool).toMatchObject({ kind: "declarative", onScreen: true, confirms: false, description: "Add mugs to the cart" });
    expect(tool?.schema).toMatchObject({ type: "object", properties: { qty: { type: "integer", minimum: 1 } } });
  });

  it("records a devtools run with its fills and result", async () => {
    const name = uniqueName("add_to_cart_x");
    toolForm(name, { answer: "Added 2" });
    await tick();
    const record = await store.runTool(name, { qty: 2 });
    expect(record).toMatchObject({ origin: "devtools", status: "ok", args: { qty: 2 } });
    expect(record.fills.map((f) => f.field)).toContain("qty");
    expect(record.endedAt).toBeGreaterThanOrEqual(record.startedAt);
    expect(store.getSnapshot().calls.filter((c) => c.tool === name)).toHaveLength(1);
  });

  it("records a call from an agent", async () => {
    const name = uniqueName("add_to_cart_x");
    toolForm(name);
    await tick();
    await modelContext().executeTool(name, { qty: 1 });
    await until(() => call(name)?.status === "ok", 3000, "agent call ok");
    expect(call(name)?.origin).toBe("agent");
    expect(store.getSnapshot().calls.filter((c) => c.tool === name)).toHaveLength(1);
  });

  it("records an agent call of an imperative tool with nothing on screen", async () => {
    const name = uniqueName("get_cart_x");
    modelContext().registerTool({ name, description: "Read the cart", execute: () => "2 items" });
    await modelContext().executeTool(name, {});
    await until(() => call(name)?.status === "ok", 3000, "agent call ok");
    expect(call(name)).toMatchObject({ origin: "agent", result: { content: [{ type: "text", text: "2 items" }] } });
    modelContext().unregisterTool?.(name);
  });

  it("finishes a cancelled agent call once, without a stray record", async () => {
    const name = uniqueName("slow_x");
    modelContext().registerTool({
      name,
      description: "Never finishes on its own",
      execute: (_: unknown, { signal }: ModelContextExecuteOptions) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")))),
    });
    const running = modelContext()
      .executeTool(name, {})
      .catch(() => {});
    await until(() => call(name)?.status === "running", 3000, "running");
    modelContext().cancelTool?.(name);
    await running;
    await tick();
    expect(
      store
        .getSnapshot()
        .calls.filter((c) => c.tool === name)
        .map((c) => c.status),
    ).toEqual(["cancelled"]);
    modelContext().unregisterTool?.(name);
  });

  it("shows a call waiting for the user, then finishing on their click", async () => {
    const name = uniqueName("place_order_x");
    const form = toolForm(name, { autosubmit: false, answer: "Ordered" });
    await tick();
    const run = store.runTool(name, { qty: 1 });
    await until(() => call(name)?.status === "waiting", 5000, "waiting");
    expect(call(name)?.prompt).toMatch(/Add to cart/);
    await userEvent.click(form.querySelector("button") as HTMLButtonElement);
    expect((await run).status).toBe("ok");
  });

  it("cancels a waiting call", async () => {
    const name = uniqueName("place_order_x");
    toolForm(name, { autosubmit: false });
    await tick();
    expect(store.getSnapshot().canCancel).toBe(true);
    const run = store.runTool(name, { qty: 1 });
    await until(() => call(name)?.status === "waiting", 5000, "waiting");
    store.cancel(call(name)?.id ?? "");
    expect((await run).status).toBe("cancelled");
  });

  it("drops a tool once it is unregistered", async () => {
    const name = uniqueName("add_to_cart_x");
    const form = toolForm(name);
    await until(() => store.getSnapshot().tools.some((t) => t.name === name), 3000, "tool listed");
    form.remove();
    await until(() => !store.getSnapshot().tools.some((t) => t.name === name), 3000, "tool gone");
  });

  it("reports a failing tool as an error, and an unknown tool too", async () => {
    const name = uniqueName("apply_promo_x");
    toolForm(name, { answer: "Error: unknown code" });
    await tick();
    expect((await store.runTool(name, { qty: 1 })).status).toBe("error");
    const missing = await store.runTool("no_such_tool", {});
    expect(missing).toMatchObject({ status: "error", error: 'Unknown tool "no_such_tool"' });
  });

  it("persists settings and drives the visuals controller", async () => {
    const controls = { setSpotlight: vi.fn(), setYieldToUser: vi.fn() };
    const local = createDevtoolsStore({ visuals: controls, storageKey: "devtools-test" });
    local.setSetting("spotlight", true);
    local.setSetting("size", 400);
    expect(controls.setSpotlight).toHaveBeenCalledWith(true);
    local.destroy();

    const again = createDevtoolsStore({ visuals: controls, storageKey: "devtools-test" });
    expect(again.getSnapshot().settings).toMatchObject({ spotlight: true, size: 400 });
    expect(controls.setSpotlight).toHaveBeenCalledTimes(1);
    await tick(); // the saved value is re-applied after the host's own setup
    expect(controls.setSpotlight).toHaveBeenCalledTimes(2);
    again.destroy();
  });

  it("exposes window.agent and restores it on destroy", async () => {
    store.destroy();
    const before = window.agent;
    const local = createDevtoolsStore();
    expect(window.agent).not.toBe(before);
    const name = uniqueName("add_to_cart_x");
    toolForm(name, { answer: "Added" });
    await tick();
    expect(await window.agent?.run(name, { qty: 1 })).toEqual({ content: [{ type: "text", text: "Added" }] });
    local.destroy();
    expect(window.agent).toBe(before);

    const listener = vi.fn();
    local.subscribe(listener);
    local.setSetting("tab", "settings");
    expect(listener).not.toHaveBeenCalled();
  });
});
