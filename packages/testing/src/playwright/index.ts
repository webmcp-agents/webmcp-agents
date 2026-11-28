/**
 * @webmcp-agents/testing/playwright: drive a page's WebMCP tools from Playwright, the way an agent would, through
 * `window.agent` (the devtools install it in development builds, so run e2e against `vite dev` or a build with the
 * devtools on). Use `test.use({ reducedMotion: "reduce" })` so the cursor snaps.
 *
 *   await openApp(page, "/");
 *   const booking = runTool(page, "book_flight", { id: "SK-204" });
 *   await parkedOn(page, page.getByRole("button", { name: "Confirm booking" }));
 *   await confirm(page, page.getByRole("button", { name: "Confirm booking" }));
 *   expect(await booking).toMatch(/booked/i);
 *
 * Needs `@playwright/test`: importing this entry without it fails with a sentence naming it.
 */
import type { Locator, Page } from "@playwright/test";
import { requirePeer } from "../peer";

const { expect } = await requirePeer(() => import("@playwright/test"), {
  peer: "@playwright/test",
  by: "@webmcp-agents/testing/playwright",
});

/** `window.agent` as the devtools install it. */
interface WindowAgent {
  invoke(name: string, args?: Record<string, unknown>): Promise<{ content: { type: string; text?: string }[]; isError?: boolean } | null>;
  list(): Promise<{ name: string }[]>;
}
type AgentWindow = { agent?: WindowAgent };

/** Options for {@link openApp}. */
export interface OpenAppOptions {
  /** How long to wait for `window.agent` and the tools. Default Playwright's expect timeout. */
  timeout?: number;
}

/**
 * Go to `path` and wait until the page is ready for tools: `window.agent` exists (the devtools, development builds)
 * and at least one tool is registered (the provider loads the polyfill in a browser without WebMCP first).
 */
export async function openApp(page: Page, path: string, options: OpenAppOptions = {}): Promise<void> {
  await page.goto(path);
  try {
    await page.waitForFunction(() => !!(window as AgentWindow).agent, undefined, { timeout: options.timeout });
  } catch (err) {
    throw new Error(
      `openApp("${path}"): window.agent never appeared. It exists in development builds (the devtools install it): run the app with vite dev, or with the devtools on.`,
      { cause: err },
    );
  }
  await expect.poll(() => listTools(page), { timeout: options.timeout, message: `tools to register on ${path}` }).not.toEqual([]);
}

/**
 * Call a tool through `window.agent` and resolve to its text answer (`undefined` when the call navigated away). A
 * failed call resolves to its error text (`Error [code]: …`), as the agent reads it.
 */
export function runTool(page: Page, name: string, args: Record<string, unknown> = {}): Promise<string | undefined> {
  return page.evaluate(
    async ([n, a]) => {
      const agent = (window as AgentWindow).agent;
      if (!agent) throw new Error("runTool(): window.agent is missing: call openApp(page, path) first.");
      const result = await agent.invoke(n, a);
      return result?.content.map((c) => ("text" in c ? (c.text ?? "") : "")).join("\n");
    },
    [name, args] as const,
  );
}

/** The names of the tools registered right now, sorted. */
export function listTools(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const agent = (window as AgentWindow).agent;
    return agent ? (await agent.list()).map((t) => t.name).sort() : [];
  });
}

/**
 * A confirm-gated tool is waiting for the person on `control`: the cursor is parked (`.agent-cursor.is-waiting`) and
 * the control is the one it found (`data-agent-active`). Only a real click goes on: {@link confirm}.
 */
export async function parkedOn(page: Page, control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("data-agent-active", "");
  await expect(page.locator(".agent-cursor.is-waiting")).toHaveCount(1);
}

/** The person confirms: wait until the tool is parked on `control`, then a real (trusted) click on it. */
export async function confirm(page: Page, control: Locator): Promise<void> {
  await parkedOn(page, control);
  await control.click();
}
