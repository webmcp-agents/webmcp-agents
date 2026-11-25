/**
 * The provider as the docs show it: `tools` (an object) and `availableTools`, tools turned on by their own `match`
 * as the URL changes, with nothing wired to a router. The earlier props (`global`, `routes`, `pathname`, `context`,
 * the array catalog) are covered, unchanged, in provider.browser.test.tsx.
 */
import { defineWebTool, type WebTool, type WebToolConfig } from "@webmcp-agents/core";
import { StrictMode, useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { useWebAgents } from "./context";
import { WebAgentsProvider, type WebAgentsProviderProps } from "./provider";
import { countToolChanges, modelContext, resultText, sleep, toolNames, uniqueName, until } from "@webmcp-agents/testing";
import { EnableTools } from "./use-enable-tools";
import { useEnabledTools } from "./use-enabled-tools";

const tool = (id: string, extra: Partial<WebToolConfig> = {}): WebTool =>
  defineWebTool({ id, description: "test tool", execute: async () => `${id} ran`, ...extra });

const has = (id: string) => until(async () => (await toolNames()).includes(id), 2000, `${id} registered`);
const lacks = (id: string) => until(async () => !(await toolNames()).includes(id), 2000, `${id} released`);

function App(props: WebAgentsProviderProps) {
  return (
    <StrictMode>
      <WebAgentsProvider visuals={false} {...props} />
    </StrictMode>
  );
}

function Enabled() {
  return <output data-testid="enabled">{useEnabledTools().join(" ")}</output>;
}

function PathProbe({ onPath }: { onPath(path: string): void }) {
  onPath(useWebAgents().pathname);
  return null;
}

/** `availableTools` decided by the app's own state, as a new array on every render: it must not churn registrations. */
function Shop({ tools }: { tools: { getTime: WebTool; getCart: WebTool; listOrders: WebTool } }) {
  const [user, setUser] = useState(false);
  return (
    <WebAgentsProvider
      visuals={false}
      tools={tools}
      availableTools={user ? [tools.getTime, tools.getCart, "listOrders"] : [tools.getTime, "getCart"]}
    >
      <button type="button" onClick={() => setUser((u) => !u)}>
        Toggle user
      </button>
    </WebAgentsProvider>
  );
}

describe("<WebAgentsProvider tools availableTools>", () => {
  const home = location.pathname + location.search;
  beforeAll(() => modelContext());
  afterEach(async () => {
    history.replaceState(null, "", home);
    await sleep(20); // let deferred releases of the unmounted tree run
  });

  it("registers every tool of an object catalog, exactly once under StrictMode", async () => {
    const tools = { getCart: tool(uniqueName("c_cart")), listOrders: tool(uniqueName("c_orders")) };
    const changes = countToolChanges();
    const screen = await render(
      <App tools={tools}>
        <Enabled />
      </App>,
    );
    await sleep(30);
    changes.stop();
    expect(await toolNames()).toEqual(expect.arrayContaining([tools.getCart.id, tools.listOrders.id]));
    expect(changes.count()).toBe(2); // one registration each, no unregister / re-register
    await expect.element(screen.getByTestId("enabled")).toHaveTextContent([tools.getCart.id, tools.listOrders.id].sort().join(" "));
    expect(resultText(await modelContext().executeTool(tools.getCart.id, {}))).toBe(`${tools.getCart.id} ran`);
    await screen.unmount();
    await lacks(tools.getCart.id);
    await lacks(tools.listOrders.id);
  });

  it("keeps an array catalog opt-in, as before: nothing is on until something names it", async () => {
    const a = tool(uniqueName("c_arr_a"));
    const b = tool(uniqueName("c_arr_b"));
    const screen = await render(
      <App tools={[a, b]}>
        <EnableTools names={[b.id]} />
      </App>,
    );
    await has(b.id);
    expect(await toolNames()).not.toContain(a.id);
    await screen.rerender(<App tools={[a, b]} availableTools={[a]} />); // the new prop works on an array too
    await has(a.id);
    await lacks(b.id);
    await screen.unmount();
  });

  it("throws on two tools with one id, naming both keys", async () => {
    const id = uniqueName("c_dupe");
    const onError = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", onError);
    await expect(render(<App tools={{ getCart: tool(id), cart: tool(id) }} />)).rejects.toThrow(
      `Duplicate tool id "${id}": tools.getCart and tools.cart`,
    );
    window.removeEventListener("error", onError);
  });

  it("limits the tools to `availableTools`, by tool reference or by catalog key, as state changes", async () => {
    const tools = { getTime: tool(uniqueName("c_time")), getCart: tool(uniqueName("c_cartx")), listOrders: tool(uniqueName("c_ordersx")) };
    const screen = await render(
      <StrictMode>
        <Shop tools={tools} />
      </StrictMode>,
    );
    await has(tools.getTime.id);
    await has(tools.getCart.id);
    expect(await toolNames()).not.toContain(tools.listOrders.id);

    const changes = countToolChanges();
    await screen.getByRole("button").click(); // signed in
    await has(tools.listOrders.id);
    expect(changes.count()).toBe(1); // only the new tool registered
    await screen.getByRole("button").click(); // signed out
    await lacks(tools.listOrders.id);
    changes.stop();
    expect(changes.count()).toBe(2);
    expect(await toolNames()).toEqual(expect.arrayContaining([tools.getTime.id, tools.getCart.id]));
    await screen.unmount();
  });

  it("turns `match` tools on and off as the visitor navigates, with nothing wired to a router", async () => {
    const tools = {
      getPage: tool(uniqueName("c_page")),
      listOrders: tool(uniqueName("c_list"), { match: "/orders" }),
      applyPromo: tool(uniqueName("c_promo"), { match: ["/cart", "/checkout"] }),
      trackOrder: tool(uniqueName("c_track"), { match: /^\/orders\/\d+(\/tracking)?$/ }),
    };
    const screen = await render(<App tools={tools} />);
    await has(tools.getPage.id);
    for (const scoped of [tools.listOrders, tools.applyPromo, tools.trackOrder]) expect(await toolNames()).not.toContain(scoped.id);

    history.pushState(null, "", "/orders"); // what a router's <Link> does
    await has(tools.listOrders.id);
    history.pushState(null, "", "/orders/42/tracking");
    await has(tools.trackOrder.id);
    await lacks(tools.listOrders.id);
    history.replaceState(null, "", "/checkout");
    await has(tools.applyPromo.id);
    await lacks(tools.trackOrder.id);
    history.back(); // to /orders
    await has(tools.listOrders.id);
    await lacks(tools.applyPromo.id);
    expect(await toolNames()).toContain(tools.getPage.id); // on everywhere, throughout
    await screen.unmount();
  });

  it("lets a `pathname` from the router override the URL, for `match` and for `routes` alike", async () => {
    const tools = {
      byMatch: tool(uniqueName("c_bymatch"), { match: "/product/:slug" }),
      byRoute: tool(uniqueName("c_byroute"), { match: "/never" }),
    };
    const routes = { "/product/*": [tools.byRoute.id] };
    let seen = "";
    const onPath = (path: string): void => {
      seen = path;
    };
    const screen = await render(
      <App tools={tools} routes={routes} pathname="/product/ocean-tee">
        <PathProbe onPath={onPath} />
      </App>,
    );
    await has(tools.byMatch.id);
    await has(tools.byRoute.id);
    expect(seen).toBe("/product/ocean-tee");
    history.pushState(null, "", "/somewhere-else"); // the router's path stands
    await sleep(50);
    expect(await toolNames()).toEqual(expect.arrayContaining([tools.byMatch.id, tools.byRoute.id]));
    await screen.rerender(
      <App tools={tools} routes={routes}>
        <PathProbe onPath={onPath} />
      </App>,
    );
    await lacks(tools.byMatch.id);
    await lacks(tools.byRoute.id);
    expect(seen).toBe("/somewhere-else");
    await screen.unmount();
  });

  it("re-registers only the tools whose definition changed when the catalog object is replaced", async () => {
    const kept = tool(uniqueName("c_kept"));
    const id = uniqueName("c_changed");
    const screen = await render(<App tools={{ kept, changed: tool(id) }} />);
    await has(id);
    const changes = countToolChanges();
    await screen.rerender(<App tools={{ kept, changed: tool(id, { description: "a new description" }) }} />);
    await sleep(30);
    changes.stop();
    expect(changes.count()).toBe(2); // `changed`: unregister + register; `kept` untouched
    expect((await modelContext().getTools()).find((t) => t.name === id)?.description).toBe("a new description");
    await screen.unmount();
  });
});
