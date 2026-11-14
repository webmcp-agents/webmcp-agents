/**
 * After a tool call, the session waits for the page's tools to settle before its next request. A route that streams
 * (a Suspense fallback) registers its component tools only once it has rendered, after the quiet time alone ends.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { toolsSettled } from "../src/session/run-agent";
import { cleanupFixtures, fixture, modelContext, uniqueName } from "./browser-utils";

describe("toolsSettled", () => {
  let mc: ModelContext;
  const names: string[] = [];
  beforeAll(() => {
    mc = modelContext();
  });
  afterEach(() => {
    for (const name of names.splice(0)) mc.unregisterTool?.(name);
    cleanupFixtures();
  });
  const register = (name: string): void => {
    names.push(name);
    mc.registerTool({
      name,
      description: "test tool",
      inputSchema: { type: "object", properties: {} },
      execute: async () => ({ content: [] }),
    });
  };
  const has = async (name: string): Promise<boolean> => (await mc.getTools()).some((t) => t.name === name);

  it("waits while the page is aria-busy, then for the tools that register as it renders", async () => {
    const name = uniqueName("streamed_tool");
    const skeleton = fixture('<div aria-busy="true">Loading product…</div>');
    // the route's content streams in after 300 ms (well past the quiet time) and registers its tool right after
    setTimeout(() => {
      skeleton.remove();
      setTimeout(() => register(name), 20);
    }, 300);
    await toolsSettled();
    expect(await has(name)).toBe(true);
  });

  it("ignores aria-busy inside the library's own UI, and still gives up after `max`", async () => {
    fixture('<div data-web-agents-ui="chat"><div aria-busy="true">streaming a reply</div></div>');
    let started = Date.now();
    await toolsSettled(100, 1500);
    expect(Date.now() - started).toBeLessThan(400);

    const stuck = fixture('<div aria-busy="true">never loads</div>');
    started = Date.now();
    await toolsSettled(100, 600);
    expect(Date.now() - started).toBeGreaterThanOrEqual(580);
    // always busy (a live feed): it held one wait to `max`, never the next
    started = Date.now();
    await toolsSettled(100, 600);
    expect(Date.now() - started).toBeLessThan(400);
    stuck.remove();
  });
});
