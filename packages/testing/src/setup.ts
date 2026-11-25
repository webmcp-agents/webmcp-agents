/**
 * `@webmcp-agents/testing/setup`: a `setupFiles` entry for browser-mode tests (`webAgentsProject("browser")` lists
 * it). It makes runs predictable and leaves nothing behind:
 *
 * - registers the matchers;
 * - installs the WebMCP polyfill (Playwright's Chromium has no WebMCP);
 * - forces reduced motion, so the cursor snaps instead of animating (`webAgentsProject("browser", { motion: "full" })`
 *   keeps the motion, for tests of the motion itself);
 * - makes ids deterministic (`u-1`, `a-1`, `call-1`…), reset before every test;
 * - after every test: unmounts what `mount` and `vitest-browser-react` rendered, removes fixtures, then fails the test
 *   if a tool call it started is still running or a tool it registered is still registered, naming the tool.
 *
 * A test of a page *without* `document.modelContext` must not use it: give that project
 * `setupFiles: ["@webmcp-agents/testing/matchers"]`.
 */
import { installWebMCPPolyfill } from "@webmcp-agents/core/polyfill";
import { afterEach, beforeEach, inject } from "vitest";
import "./matchers";
import { beginTest, endTest, guardModelContext } from "./guard";
import { cleanupFixtures } from "./helpers/dom";
import { installIds, resetIds } from "./ids";

import type { MotionSetting } from "./vitest";

type BrowserContext = typeof import("vitest/browser");

const browser = typeof document !== "undefined";
let context: BrowserContext | undefined;

/** The `vitest/browser` module, when this is browser mode. */
async function browserContext(): Promise<BrowserContext | undefined> {
  if (!browser) return undefined;
  try {
    context ??= await import("vitest/browser");
  } catch {
    context = undefined;
  }
  return context;
}

/** Make `matchMedia("(prefers-reduced-motion: reduce)")` match: through Chrome's DevTools protocol, else a stub. */
async function reduceMotion(): Promise<void> {
  const ctx = await browserContext();
  try {
    // `send` is typed by @vitest/browser-playwright, an optional peer
    const session = ctx?.cdp() as unknown as { send(method: string, params: unknown): Promise<unknown> } | undefined;
    await session?.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    // not Chromium through Playwright: fall back to the stub
  }
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query: string): MediaQueryList => {
    const list = original(query);
    if (!/prefers-reduced-motion:\s*reduce/.test(query)) return list;
    return Object.assign(Object.create(list), { matches: true, media: query });
  };
}

const readMotion = (): MotionSetting => {
  try {
    return inject("webAgentsMotion") === "full" ? "full" : "reduced";
  } catch {
    return "reduced";
  }
};

installIds();
if (browser) {
  const mc = installWebMCPPolyfill();
  if (mc) guardModelContext(mc);
  if (readMotion() === "reduced") await reduceMotion();
}

beforeEach(async () => {
  resetIds();
  if (browser) await beginTest();
});

afterEach(async () => {
  if (!browser) return;
  const problems = await endTest(async () => {
    const ctx = await browserContext();
    // what vitest-browser-react (and the other component libraries) rendered, before the fixtures go
    const cleanup = (ctx?.page as unknown as Record<symbol, (() => unknown) | undefined> | undefined)?.[
      Symbol.for("vitest:component-cleanup")
    ];
    await cleanup?.();
    cleanupFixtures();
  });
  if (problems.length) throw new Error(problems.join("\n"));
});
