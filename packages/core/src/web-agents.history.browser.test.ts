/**
 * URL tracking in a browser without the Navigation API (Firefox < 147, older Safari): `history.pushState` and
 * `replaceState` are patched while someone watches, and put back after. Chromium has the API, so it is hidden here.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { modelContext, uniqueName, until } from "@webmcp-agents/testing";
import { createWebAgents, watchPathname } from "./web-agents";
import { defineWebTool } from "./web-tool";

describe("URL tracking without the Navigation API", () => {
  const home = location.pathname + location.search;
  const pushState = history.pushState;
  const replaceState = history.replaceState;

  beforeAll(() => {
    // an own property shadows the one on Window.prototype
    Object.defineProperty(window, "navigation", { value: undefined, configurable: true });
  });
  afterAll(() => {
    delete (window as { navigation?: unknown }).navigation;
  });
  afterEach(() => history.replaceState(null, "", home));

  it("patches history only while someone watches, and restores it", async () => {
    const listener = vi.fn();
    const stop = watchPathname(listener);
    expect(history.pushState).not.toBe(pushState);
    expect(history.replaceState).not.toBe(replaceState);

    history.pushState({ n: 1 }, "", "/patched");
    expect(location.pathname).toBe("/patched"); // the real pushState still ran
    expect(history.state).toEqual({ n: 1 });
    await Promise.resolve(); // listeners hear of it after the call returns
    expect(listener).toHaveBeenCalledTimes(1);
    history.replaceState(null, "", "/patched-again");
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    expect(history.pushState).toBe(pushState);
    expect(history.replaceState).toBe(replaceState);
    history.pushState(null, "", "/unwatched");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("leaves a later patch by someone else in place", () => {
    const stop = watchPathname(() => {});
    const ours = history.pushState;
    const theirs: History["pushState"] = function (this: History, ...args) {
      ours.apply(this, args);
    };
    history.pushState = theirs;
    stop();
    expect(history.pushState).toBe(theirs); // restoring ours would drop theirs
    history.pushState(null, "", "/still-works");
    expect(location.pathname).toBe("/still-works");
    history.pushState = pushState;
  });

  it("turns `match` tools on and off on pushState, replaceState, popstate and hash changes", async () => {
    modelContext();
    const orders = defineWebTool({ id: uniqueName("wh_orders"), description: "d", match: "/orders", execute: () => "ok" });
    const agents = createWebAgents({ tools: { orders }, visuals: false });
    const enabled = (): boolean => agents.registry.enabled().includes(orders.id);
    expect(enabled()).toBe(false);

    history.pushState(null, "", "/orders");
    await Promise.resolve(); // tools follow right after the navigation call returns
    expect(enabled()).toBe(true);
    history.replaceState(null, "", "/cart");
    await until(() => !enabled(), 2000, "off after replaceState");
    history.pushState(null, "", "/orders");
    await Promise.resolve(); // tools follow right after the navigation call returns
    expect(enabled()).toBe(true);
    history.pushState(null, "", "/cart");
    await until(() => !enabled(), 2000, "off after pushState");
    history.back(); // popstate, back to /orders
    await until(enabled, 2000, "on after popstate");
    location.hash = "#/cart"; // a hash router's navigation
    await until(() => !enabled(), 2000, "off after hashchange");
    location.hash = "#/orders";
    await until(enabled, 2000, "on after hashchange");

    agents.destroy();
    expect(history.pushState).toBe(pushState);
  });
});
