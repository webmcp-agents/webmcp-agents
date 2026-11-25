import { defineWebTool, type WebTool } from "@webmcp-agents/core";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { useWebAgents } from "./context";
import { WebAgentsProvider, type WebAgentsProviderProps } from "./provider";
import { EnableTools } from "./use-enable-tools";
import { countToolChanges, modelContext, resultText, sleep, toolNames, uniqueName, until } from "@webmcp-agents/testing";

const tool = (id: string, execute: WebTool["execute"] = async () => `${id} ran`): WebTool =>
  defineWebTool({ id, description: "test tool", execute });

const QUIET = { linger: 50, yieldToUser: false } as const;

function App({ children, ...props }: Partial<WebAgentsProviderProps> & { children?: ReactNode }) {
  return (
    <StrictMode>
      <WebAgentsProvider visuals={QUIET} {...props}>
        {children}
      </WebAgentsProvider>
    </StrictMode>
  );
}

function Probe({ onValue }: { onValue: (value: ReturnType<typeof useWebAgents>) => void }) {
  onValue(useWebAgents());
  return null;
}

function Orphan() {
  useWebAgents();
  return null;
}

describe("<WebAgentsProvider>", () => {
  beforeAll(() => modelContext());
  afterEach(() => sleep(20)); // let deferred releases of the unmounted tree run

  it("registers global tools exactly once under StrictMode", async () => {
    const a = uniqueName("p_a");
    const cat = [tool(a)];
    const changes = countToolChanges();
    const screen = await render(<App tools={cat} global={[a]} />);
    await sleep(20);
    changes.stop();
    expect((await toolNames()).filter((n) => n === a)).toHaveLength(1);
    expect(changes.count()).toBe(1);
    await screen.unmount();
    await sleep(20);
    expect(await toolNames()).not.toContain(a);
  });

  it("enables route-scoped tools for matching pathnames only", async () => {
    const b = uniqueName("p_b");
    const cat = [tool(b)];
    const routes = { "/orders": [b] };
    const screen = await render(<App tools={cat} routes={routes} pathname="/" />);
    expect(await toolNames()).not.toContain(b);
    await screen.rerender(<App tools={cat} routes={routes} pathname="/orders" />);
    expect(await toolNames()).toContain(b);
    await screen.rerender(<App tools={cat} routes={routes} pathname="/" />);
    await sleep(20);
    expect(await toolNames()).not.toContain(b);
    await screen.unmount();
  });

  it("<EnableTools> holds a tool while mounted, ref-counted with other holders", async () => {
    const c = uniqueName("p_c");
    const cat = [tool(c)];
    const screen = await render(
      <App tools={cat}>
        <EnableTools names={[c]} />
        <EnableTools names={[c]} />
      </App>,
    );
    expect(await toolNames()).toContain(c);
    await screen.rerender(
      <App tools={cat}>
        <EnableTools names={[c]} />
      </App>,
    );
    await sleep(20);
    expect(await toolNames()).toContain(c);
    await screen.rerender(<App tools={cat} />);
    await sleep(20);
    expect(await toolNames()).not.toContain(c);
    await screen.unmount();
  });

  it("installs the visuals so a tool with an on-screen element is animated", async () => {
    const d = uniqueName("p_d");
    const cat = [tool(d)];
    const screen = await render(
      <App tools={cat} global={[d]}>
        <button type="button" toolname={d}>
          Go
        </button>
      </App>,
    );
    const res = await modelContext().executeTool(d, {});
    expect(resultText(res)).toBe(`${d} ran`);
    expect(document.querySelector(".agent-cursor")).not.toBeNull();
    await screen.unmount();
  });

  it("installs nothing with visuals={false}", async () => {
    await sleep(50); // earlier tests' layer is gone
    const e = uniqueName("p_e");
    const screen = await render(<App tools={[tool(e)]} global={[e]} visuals={false} />);
    expect(await toolNames()).toContain(e);
    expect(document.querySelector(".agent-cursor")).toBeNull();
    await screen.unmount();
  });

  it("hands the latest context prop to execute as ctx.context", async () => {
    const f = uniqueName("p_f");
    const cat = [tool(f, async (_i, ctx) => `cart has ${String(ctx.context)}`)];
    const screen = await render(<App tools={cat} global={[f]} context={1} />);
    expect(resultText(await modelContext().executeTool(f, {}))).toBe("cart has 1");
    await screen.rerender(<App tools={cat} global={[f]} context={2} />);
    expect(resultText(await modelContext().executeTool(f, {}))).toBe("cart has 2");
    await screen.unmount();
  });

  it("exposes the registry, pathname and visuals controls through useWebAgents()", async () => {
    let seen: ReturnType<typeof useWebAgents> | null = null;
    const screen = await render(
      <App pathname="/x">
        <Probe onValue={(v) => (seen = v)} />
      </App>,
    );
    await until(() => seen !== null);
    expect(seen!.pathname).toBe("/x");
    expect(seen!.visuals).not.toBeNull();
    expect(seen!.registry.enabled()).toEqual([]);
    await screen.unmount();
  });

  it("throws a helpful error outside the provider", async () => {
    const onError = (e: ErrorEvent) => e.preventDefault();
    window.addEventListener("error", onError);
    await expect(render(<Orphan />)).rejects.toThrow("useWebAgents must be used inside <WebAgentsProvider>");
    window.removeEventListener("error", onError);
  });
});
