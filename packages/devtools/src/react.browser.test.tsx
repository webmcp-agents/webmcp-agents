import { TanStackDevtools } from "@tanstack/react-devtools";
import { createWebAgents, type WebAgents } from "@webmcp-agents/core";
import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { WebAgentsDevtools, webAgentsDevtoolsPlugin } from "./react";
import { byText, deepText, uiRoot, modelContext, until } from "@webmcp-agents/testing";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// With <WebAgentsProvider> itself: packages/react/src/provider.devtools.browser.test.tsx (react depends on devtools).
describe("@webmcp-agents/devtools/react", () => {
  beforeAll(() => modelContext());
  beforeAll(() => localStorage.clear());
  let agents: WebAgents | undefined;
  afterEach(async () => {
    agents?.destroy();
    agents = undefined;
    await sleep(20); // deferred store release of the unmounted tree
  });

  it("mounts one panel under StrictMode and drives the started createWebAgents' cursor", async () => {
    agents = createWebAgents({ tools: {}, visuals: { spotlight: false, yieldToUser: false } });
    const setSpotlight = vi.spyOn(agents.visuals, "setSpotlight");
    const screen = await render(
      <StrictMode>
        <WebAgentsDevtools initialOpen eventClient={false} />
      </StrictMode>,
    );
    await until(() => !!document.querySelector("[data-web-agents-ui]")?.shadowRoot?.querySelector('[role="dialog"]'), 3000, "panel");
    await sleep(20);
    expect(document.querySelectorAll("[data-web-agents-ui]")).toHaveLength(1);
    expect(window.agent).toBeDefined();

    await userEvent.click(byText(uiRoot("devtools"), '[role="tab"]', "Settings") as HTMLElement);
    const spotlight = uiRoot("devtools").querySelector<HTMLButtonElement>('[role="switch"]') as HTMLButtonElement;
    expect(spotlight.disabled).toBe(false);
    await userEvent.click(spotlight);
    expect(setSpotlight).toHaveBeenCalledWith(true);
    expect(spotlight.getAttribute("aria-checked")).toBe("true");

    await screen.unmount();
    await sleep(20);
    expect(document.querySelectorAll("[data-web-agents-ui]")).toHaveLength(0);
    expect(window.agent).toBeUndefined();
  });

  it("disables the cursor switches with nothing started", async () => {
    const screen = await render(<WebAgentsDevtools initialOpen eventClient={false} />);
    await until(() => !!document.querySelector("[data-web-agents-ui]")?.shadowRoot?.querySelector('[role="dialog"]'), 3000, "panel");
    await userEvent.click(byText(uiRoot("devtools"), '[role="tab"]', "Settings") as HTMLElement);
    expect(uiRoot("devtools").querySelector<HTMLButtonElement>('[role="switch"]')?.disabled).toBe(true);
    await screen.unmount();
  });

  it("works as a TanStack Devtools plugin", async () => {
    const plugin = webAgentsDevtoolsPlugin({ eventClient: false });
    expect(plugin).toMatchObject({ id: "web-agents", name: "Web Agents" });
    const screen = await render(<TanStackDevtools plugins={[plugin]} config={{ defaultOpen: true }} />);
    await until(() => deepText().includes("Web Agents"), 5000, "Web Agents tab");
    await screen.unmount();
  });
});
