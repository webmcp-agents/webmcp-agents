import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupFixtures, fixture, modelContext, resultText, uniqueName, until } from "@webmcp-agents/testing";
import { createWebAgents, currentAgentVisuals, type WebAgents, watchPathname } from "./web-agents";
import { defineWebTool, type WebTool, type WebToolConfig } from "./web-tool";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const names = async (): Promise<string[]> => (await modelContext().getTools()).map((t) => t.name);
const tool = (id: string, extra: Partial<WebToolConfig> = {}): WebTool =>
  defineWebTool({ id, description: "test tool", execute: () => `${id} ran`, ...extra });

/** Poll until the registered tools include (or exclude) `id`. A release is deferred, so "off" takes a moment. */
async function registered(id: string, wanted: boolean, timeout = 2000): Promise<void> {
  const started = performance.now();
  while ((await names()).includes(id) !== wanted) {
    if (performance.now() - started > timeout) throw new Error(`Timed out waiting for ${id} to be ${wanted ? "on" : "off"}`);
    await sleep(10);
  }
}
const on = (id: string) => registered(id, true);
const off = (id: string) => registered(id, false);

describe("createWebAgents", () => {
  let agents: WebAgents | null = null;
  const home = location.pathname + location.search;

  beforeEach(() => {
    modelContext();
  });

  afterEach(async () => {
    agents?.destroy();
    agents = null;
    history.replaceState(null, "", home);
    await sleep(30); // deferred releases of this test's tools
    cleanupFixtures();
  });

  it("registers every catalog tool, from an object or an array, and installs the cursor first", async () => {
    const a = uniqueName("wa_a");
    const b = uniqueName("wa_b");
    fixture(`<button type="button">${a.replaceAll("_", " ")}</button>`);
    agents = createWebAgents({ tools: { first: tool(a), second: tool(b) }, visuals: { linger: 50, yieldToUser: false } });
    expect(await names()).toEqual(expect.arrayContaining([a, b]));
    expect(agents.registry.enabled()).toEqual([a, b]);
    await modelContext().executeTool(a, {});
    expect(document.querySelector(".agent-cursor")).not.toBeNull(); // the registration went through the visuals
    agents.destroy();
    agents = createWebAgents({ tools: [tool(a)], visuals: false });
    await sleep(30);
    expect(await names()).toContain(a);
    expect(await names()).not.toContain(b);
  });

  it("throws on two tools with one id, naming both keys", () => {
    const id = uniqueName("wa_dupe");
    expect(() => createWebAgents({ tools: { getCart: tool(id), cart: tool(id) }, visuals: false })).toThrow(
      `Duplicate tool id "${id}": tools.getCart and tools.cart`,
    );
    expect(() => createWebAgents({ tools: [tool(id), tool("wa_other"), tool(id)], visuals: false })).toThrow("tools[0] and tools[2]");
    agents = createWebAgents({ tools: { a: tool(id) }, visuals: false });
    expect(() => agents?.setTools({ a: tool(id), b: tool(id) })).toThrow(/tools\.a and tools\.b/);
  });

  it("setAvailableTools limits the tools, by reference, by catalog key or by id, and `undefined` restores all", async () => {
    const tools = { time: tool(uniqueName("wa_time")), cart: tool(uniqueName("wa_cart")), orders: tool(uniqueName("wa_orders")) };
    agents = createWebAgents({ tools, availableTools: [tools.time], visuals: false });
    expect(agents.registry.enabled()).toEqual([tools.time.id]);
    agents.setAvailableTools([tools.time, "cart"]);
    expect(agents.registry.enabled()).toEqual([tools.cart.id, tools.time.id].sort());
    agents.setAvailableTools([tools.orders.id]);
    await off(tools.time.id);
    expect(await names()).toContain(tools.orders.id);
    expect(await names()).not.toContain(tools.cart.id);
    agents.setAvailableTools(undefined);
    expect(agents.registry.enabled()).toHaveLength(3);
    agents.setAvailableTools([]);
    await off(tools.orders.id);
    expect(agents.registry.enabled()).toEqual([]);
  });

  it("setTools swaps the catalog: tools that left are released, new ones registered, unchanged ones untouched", async () => {
    const kept = tool(uniqueName("wa_kept"));
    const gone = tool(uniqueName("wa_gone"));
    const added = tool(uniqueName("wa_added"));
    agents = createWebAgents({ tools: { kept, gone }, visuals: false });
    await sleep(20);
    const changes = vi.fn();
    modelContext().addEventListener("toolchange", changes);
    agents.setTools({ kept, added });
    await off(gone.id);
    modelContext().removeEventListener("toolchange", changes);
    expect(await names()).toEqual(expect.arrayContaining([kept.id, added.id]));
    expect(changes).toHaveBeenCalledTimes(2); // one registered, one unregistered: `kept` never changed
  });

  it("turns `match` tools on and off as the URL changes: a pattern, several, a RegExp", async () => {
    const everywhere = tool(uniqueName("wa_everywhere"));
    const orders = tool(uniqueName("wa_orders"), { match: "/orders" });
    const product = tool(uniqueName("wa_product"), { match: "/product/:slug" });
    const promo = tool(uniqueName("wa_promo"), { match: ["/cart", "/checkout/*"] });
    const tracking = tool(uniqueName("wa_tracking"), { match: /^\/orders\/\d+(\/tracking)?$/ });
    agents = createWebAgents({ tools: { everywhere, orders, product, promo, tracking }, visuals: false });
    const enabled = (): readonly string[] => (agents as WebAgents).registry.enabled();
    const expectOn = (...tools: WebTool[]): void => expect(enabled()).toEqual([everywhere, ...tools].map((t) => t.id).sort());
    expectOn(); // the test page's own path matches none of them

    history.pushState(null, "", "/orders"); // a router navigating
    await Promise.resolve(); // tools follow right after the navigation call returns
    expectOn(orders);
    history.pushState(null, "", "/orders/42/tracking");
    await Promise.resolve();
    expect(enabled()).toContain(tracking.id); // on at once; what stopped matching is released a moment later
    await off(orders.id);
    expectOn(tracking);
    history.replaceState(null, "", "/product/ocean-tee?size=m"); // the query is not part of the path
    await off(tracking.id);
    expectOn(product);
    history.pushState(null, "", "/checkout/payment");
    await off(product.id);
    expectOn(promo);
    history.pushState(null, "", "/cart/");
    await Promise.resolve();
    expectOn(promo); // the other pattern of the same tool, trailing slash ignored: never released

    history.back(); // popstate
    history.back();
    await until(() => location.pathname === "/product/ocean-tee", 2000, "back twice");
    await on(product.id);
    await off(promo.id);
    expectOn(product);
  });

  it("follows a hash router: `#/orders` is the path `/orders`", async () => {
    const orders = tool(uniqueName("wa_hash_orders"), { match: "/orders" });
    agents = createWebAgents({ tools: [orders], visuals: false });
    expect(agents.registry.enabled()).toEqual([]);
    location.hash = "#/orders?tab=open";
    await on(orders.id);
    location.hash = "#/";
    await off(orders.id);
    location.hash = "#details"; // an anchor is not a route: the pathname decides again
    await sleep(30);
    expect(agents.registry.enabled()).toEqual([]);
    history.replaceState(null, "", home);
  });

  it("follows the Navigation API where the browser has it", async () => {
    const navigation = (
      globalThis as { navigation?: { navigate(url: string, options?: { history?: string }): { finished: Promise<unknown> } } }
    ).navigation;
    if (!navigation) return; // Chromium has it; kept honest for a browser that doesn't
    const pushState = history.pushState;
    const settings = tool(uniqueName("wa_nav_settings"), { match: "/settings" });
    agents = createWebAgents({ tools: [settings], visuals: false });
    expect(history.pushState).toBe(pushState); // nothing patched: the Navigation API reports every navigation
    await navigation.navigate(`${home}#/settings`).finished; // same document: only the fragment differs
    await on(settings.id);
    await navigation.navigate(`${home}#/`, { history: "replace" }).finished;
    await off(settings.id);
  });

  it("setPathname overrides the URL, and `undefined` follows it again", async () => {
    const orders = tool(uniqueName("wa_override"), { match: "/orders" });
    agents = createWebAgents({ tools: [orders], visuals: false });
    agents.setPathname("/orders");
    expect(agents.registry.enabled()).toEqual([orders.id]);
    history.pushState(null, "", "/elsewhere"); // the override stands
    expect(agents.registry.enabled()).toEqual([orders.id]);
    agents.setPathname(undefined);
    await off(orders.id);
  });

  it("releases a tool that stops matching only after its call in flight is answered", async () => {
    let finish!: (value: string) => void;
    const slow = tool(uniqueName("wa_slow"), { match: "/slow", execute: () => new Promise<string>((resolve) => (finish = resolve)) });
    agents = createWebAgents({ tools: [slow], visuals: false });
    history.pushState(null, "", "/slow");
    await on(slow.id);
    const pending = modelContext().executeTool(slow.id, {});
    await until(() => !!finish, 1000, "execute running");

    history.pushState(null, "", "/gone"); // the tool no longer matches
    await sleep(300);
    expect(await names()).toContain(slow.id); // still registered: unregistering would cancel the call
    finish("answered");
    expect(resultText(await pending)).toBe("answered");
    expect(await names()).toContain(slow.id); // and for the answer's grace
    await registered(slow.id, false, 2500); // released after the answer
  });

  it("the registry enables a catalog tool by hand, on top of what is available", async () => {
    const extra = tool(uniqueName("wa_extra"), { match: "/never" });
    agents = createWebAgents({ tools: { extra }, visuals: false });
    expect(agents.registry.enabled()).toEqual([]);
    const release = agents.registry.enable([extra.id]);
    expect(await names()).toContain(extra.id);
    release();
    await off(extra.id);
  });

  it("`start: false` does nothing until start(); destroy() stops and start() resumes without re-registering", async () => {
    const a = tool(uniqueName("wa_lazy"));
    fixture("<p>page</p>");
    await sleep(50); // an earlier test's cursor is gone
    agents = createWebAgents({ tools: [a], visuals: { linger: 50 }, start: false });
    await sleep(20);
    expect(await names()).not.toContain(a.id);
    expect(document.querySelector(".agent-sr-only, .agent-cursor")).toBeNull();

    const changes = vi.fn();
    modelContext().addEventListener("toolchange", changes);
    agents.start();
    agents.start(); // idempotent
    expect(await names()).toContain(a.id);
    agents.destroy(); // React StrictMode: unmount …
    agents.start(); // … and mount again, in the same tick
    await sleep(50);
    expect(changes).toHaveBeenCalledOnce();
    expect(await names()).toContain(a.id);

    agents.destroy();
    history.pushState(null, "", "/after-destroy"); // no longer followed
    await off(a.id);
    modelContext().removeEventListener("toolchange", changes);
    expect(changes).toHaveBeenCalledTimes(2);
  });
  it("currentAgentVisuals is the cursor of the latest started instance that has one", async () => {
    expect(currentAgentVisuals()).toBeNull();
    agents = createWebAgents({ tools: {}, visuals: { linger: 50 } });
    expect(currentAgentVisuals()).toBe(agents.visuals);
    const bare = createWebAgents({ tools: {}, visuals: false }); // no cursor: not the answer
    expect(currentAgentVisuals()).toBe(agents.visuals);
    const later = createWebAgents({ tools: {}, visuals: { linger: 50 } });
    expect(currentAgentVisuals()).toBe(later.visuals);
    later.destroy();
    bare.destroy();
    expect(currentAgentVisuals()).toBe(agents.visuals);
    agents.destroy();
    expect(currentAgentVisuals()).toBeNull();
  });
});

describe("watchPathname", () => {
  it("calls every listener on a navigation, and stops when unsubscribed", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const home = location.pathname + location.search;
    const stopA = watchPathname(a);
    const stopB = watchPathname(b);
    history.pushState(null, "", "/watched");
    await Promise.resolve();
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    stopA();
    const before = b.mock.calls.length;
    a.mockClear();
    history.replaceState(null, "", home);
    await Promise.resolve();
    expect(a).not.toHaveBeenCalled();
    expect(b.mock.calls.length).toBeGreaterThan(before);
    stopB();
    stopB(); // idempotent
  });

  it("tells listeners after the navigation call returns, once per burst", async () => {
    // A router may change the URL inside a React insertion effect (Next.js): a listener that updates React there throws.
    const listener = vi.fn();
    const home = location.pathname + location.search;
    const stop = watchPathname(listener);
    history.pushState(null, "", "/burst-1");
    history.replaceState(null, "", "/burst-2");
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    history.replaceState(null, "", home);
    await Promise.resolve();
    stop();
  });
});
