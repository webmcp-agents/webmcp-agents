/**
 * The provider installs the devtools panel in development (vitest.config.ts runs this file with NODE_ENV
 * "development"), wired to its cursor. The other half is provider.devtools.off.browser.test.tsx.
 */
import { WebAgentsDevtools } from "@webmcp-agents/devtools/react";
import { StrictMode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useWebAgents, type WebAgentsVisuals } from "./context";
import { WebAgentsProvider } from "./provider";
import { modelContext, sleep, until } from "@webmcp-agents/testing";

const QUIET = { spotlight: false, yieldToUser: false } as const;
const hosts = (): NodeListOf<Element> => document.querySelectorAll('[data-web-agents-ui="devtools"]');
const root = (): ShadowRoot => {
  const shadow = hosts()[0]?.shadowRoot;
  if (!shadow) throw new Error("devtools are not mounted");
  return shadow;
};
const byText = (selector: string, text: string): HTMLElement =>
  [...root().querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.includes(text)) as HTMLElement;
const panelOpen = (): boolean => !!hosts()[0]?.shadowRoot?.querySelector('[role="dialog"]');

function Probe({ onVisuals }: { onVisuals(visuals: WebAgentsVisuals | null): void }) {
  onVisuals(useWebAgents().visuals);
  return null;
}

/** The Settings tab's first switch (Spotlight). */
async function spotlightSwitch(): Promise<HTMLButtonElement> {
  await userEvent.click(byText('[role="tab"]', "Settings"));
  return root().querySelector<HTMLButtonElement>('[role="switch"]') as HTMLButtonElement;
}

describe("<WebAgentsProvider devtools>", () => {
  beforeAll(() => modelContext());
  beforeAll(() => localStorage.clear());
  afterEach(async () => {
    await sleep(30); // the deferred release of the unmounted tree
    localStorage.clear();
  });

  it("installs one panel under StrictMode, drives its own cursor, and removes it on unmount", async () => {
    let visuals: WebAgentsVisuals | null = null;
    const screen = await render(
      <StrictMode>
        <WebAgentsProvider visuals={QUIET} devtools={{ initialOpen: true, eventClient: false }}>
          <Probe onVisuals={(v) => (visuals = v)} />
        </WebAgentsProvider>
      </StrictMode>,
    );
    await until(panelOpen, 5000, "panel");
    await sleep(30);
    expect(hosts()).toHaveLength(1);
    expect(window.agent).toBeDefined();

    const setSpotlight = vi.spyOn(visuals as unknown as WebAgentsVisuals, "setSpotlight");
    const spotlight = await spotlightSwitch();
    expect(spotlight.disabled).toBe(false);
    await userEvent.click(spotlight);
    expect(setSpotlight).toHaveBeenCalledWith(true);

    await screen.unmount();
    await sleep(30);
    expect(hosts()).toHaveLength(0);
    expect(window.agent).toBeUndefined();
  });

  it("is on by default, closed until opened", async () => {
    const screen = await render(<WebAgentsProvider visuals={QUIET} />);
    await until(() => hosts().length === 1, 5000, "panel host");
    expect(panelOpen()).toBe(false);
    await screen.unmount();
  });

  it("shares one panel between two providers; the last to unmount removes it", async () => {
    const first = await render(<WebAgentsProvider visuals={QUIET} />);
    const second = await render(<WebAgentsProvider visuals={QUIET} />);
    await until(() => hosts().length === 1, 5000, "panel host");
    await sleep(100);
    expect(hosts()).toHaveLength(1);
    await first.unmount();
    await sleep(30);
    expect(hosts()).toHaveLength(1);
    await second.unmount();
    await sleep(30);
    expect(hosts()).toHaveLength(0);
  });

  it("with visuals={false}, the panel has no cursor to drive", async () => {
    const screen = await render(<WebAgentsProvider visuals={false} devtools={{ initialOpen: true, eventClient: false }} />);
    await until(panelOpen, 5000, "panel");
    expect((await spotlightSwitch()).disabled).toBe(true);
    await screen.unmount();
  });

  it("devtools={false} installs nothing; <WebAgentsDevtools /> inside drives the provider's cursor", async () => {
    let visuals: WebAgentsVisuals | null = null;
    const off = await render(<WebAgentsProvider visuals={QUIET} devtools={false} />);
    await sleep(300);
    expect(hosts()).toHaveLength(0);
    expect(window.agent).toBeUndefined();
    await off.unmount();

    const screen = await render(
      <StrictMode>
        <WebAgentsProvider visuals={QUIET} devtools={false}>
          <Probe onVisuals={(v) => (visuals = v)} />
          <WebAgentsDevtools initialOpen eventClient={false} />
        </WebAgentsProvider>
      </StrictMode>,
    );
    await until(panelOpen, 5000, "panel");
    await sleep(30);
    expect(hosts()).toHaveLength(1);
    const setSpotlight = vi.spyOn(visuals as unknown as WebAgentsVisuals, "setSpotlight");
    const spotlight = await spotlightSwitch();
    expect(spotlight.disabled).toBe(false);
    await userEvent.click(spotlight);
    expect(setSpotlight).toHaveBeenCalledWith(true);
    await screen.unmount();
    await sleep(30);
    expect(hosts()).toHaveLength(0);
  });
});
