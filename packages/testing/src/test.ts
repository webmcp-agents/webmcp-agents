/**
 * `test`, extended with the kit's fixtures. Vitest sets up only the fixtures a test destructures, so a Node test that
 * destructures none pays for no browser fixture.
 */
import type { ModelContextToolResult, WebTool } from "@webmcp-agents/core";
import { configureRedaction, getRedactor, type Redactor } from "@webmcp-agents/core/redact";
import { test as base } from "vitest";
import { type FakeUser, fakeUser } from "./fake-user";
import { deferCleanup } from "./guard";
import { type EventLog, recordEvents } from "./helpers/events";
import { type CallToolOptions, callTool, type MockedTool, type MockToolDefinition, type MockToolImpl, mockTool } from "./helpers/tools";
import { sleep } from "./helpers/wait";
import { createMount, type Mount } from "./mount";
import { requirePeer } from "./peer";
import type { RunLog } from "./run-record";
import type { SpansFixture } from "./telemetry/observe-spans";

/** The `tools` fixture: the page's tools, as an agent reaches them. */
export interface ToolsFixture {
  /** `callTool`: the tool's MCP result (never rejects for the tool's own failure). */
  call(tool: string | WebTool, input?: Record<string, unknown>, options?: CallToolOptions): Promise<ModelContextToolResult | null>;
  /** The names of the tools registered right now, sorted. */
  list(): Promise<string[]>;
  /** `mockTool`, unregistered after the test. */
  mock(name: string, impl?: MockToolImpl): MockedTool;
  mock(name: string, definition: MockToolDefinition, impl?: MockToolImpl): MockedTool;
  /** Resolve once the tool list has been quiet (no `toolchange`) for `quietMs` (default 150), e.g. after a navigation. */
  settled(quietMs?: number): Promise<void>;
}

export type { SpansFixture } from "./telemetry/observe-spans";

/** The fixtures the kit's `test` adds. */
export interface WebAgentsFixtures {
  /** The page's tools: `call`, `list`, `mock`, `settled`. Mocks are unregistered after the test. */
  tools: ToolsFixture;
  /** Every `AgentEvent` from the start of the test; recording stops after it. */
  events: EventLog;
  /** Trusted input: `confirm`, `moveOn`, `scroll`, `click`, `type`. Browser mode only. */
  user: FakeUser;
  /** Mount HTML or a React element; removed (React roots unmounted) after the test. Browser mode only. */
  mount: Mount;
  /** A fresh page redactor (`configureRedaction({})`), reset again after the test. */
  redactor: Redactor;
  /**
   * Every `AgentRunEvent` of the test (the chat's, `useWebAgent`'s, `agent.invoke`'s, sub-agents'), redacted as a
   * listener sees them by default; recording stops after the test. Needs `@webmcp-agents/chat`.
   */
  runs: RunLog;
  /**
   * Every browser span of the test (`observeAgents` into a memory exporter, redacted as it would be exported), with
   * `flush()` to wait for the buffered ones. Needs `@webmcp-agents/telemetry`.
   */
  spans: SpansFixture;
}

/**
 * Register a teardown both with the guard (so `./setup` runs it before checking what the test left behind) and for
 * the fixture's own end (without `./setup`). Each runs once.
 */
const once = (fn: () => unknown): (() => unknown) => {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    return fn();
  };
};

/**
 * Vitest's `test` with the kit's fixtures: `tools`, `events`, `user`, `mount`, `redactor`, `runs` and `spans`. Use it
 * like `test`; destructure what the test needs.
 *
 * @example
 * test("adds to the cart", async ({ tools, events, mount }) => {
 *   mount('<form toolname="add_to_cart" tooldescription="Add mugs" toolautosubmit><input name="qty"><button>Add</button></form>');
 *   expect(await tools.call("add_to_cart", { qty: "2" })).toBeToolResult();
 *   expect(events).toHaveFilled("qty", "2");
 * });
 */
export const test = base.extend<WebAgentsFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Vitest reads the fixtures a fixture needs from this pattern
  tools: async ({}, use) => {
    const mocks: MockedTool[] = [];
    const cleanup = once(() => {
      for (const m of mocks.splice(0)) m.unregister();
    });
    deferCleanup(cleanup);
    const mock = ((name: string, a?: MockToolDefinition | MockToolImpl, b?: MockToolImpl) => {
      const m = typeof a === "function" || a === undefined ? mockTool(name, a) : mockTool(name, a, b);
      mocks.push(m);
      return m;
    }) as ToolsFixture["mock"];
    await use({
      call: callTool,
      list: async () => {
        const mc = typeof document === "undefined" ? undefined : document.modelContext;
        return mc ? (await mc.getTools()).map((t) => t.name).sort() : [];
      },
      mock,
      async settled(quietMs = 150) {
        const mc = document.modelContext;
        if (!mc) return;
        let last = performance.now();
        const onChange = (): void => {
          last = performance.now();
        };
        mc.addEventListener("toolchange", onChange);
        try {
          while (performance.now() - last < quietMs) await sleep(Math.max(10, quietMs - (performance.now() - last)));
        } finally {
          mc.removeEventListener("toolchange", onChange);
        }
      },
    });
    await cleanup();
  },
  // biome-ignore lint/correctness/noEmptyPattern: see above
  events: async ({}, use) => {
    const log = recordEvents();
    await use(log);
    log.stop();
  },
  // biome-ignore lint/correctness/noEmptyPattern: see above
  user: async ({}, use) => {
    await use(await fakeUser());
  },
  // biome-ignore lint/correctness/noEmptyPattern: see above
  mount: async ({}, use) => {
    const { mount, unmountAll } = await createMount();
    const cleanup = once(unmountAll);
    deferCleanup(cleanup);
    await use(mount);
    await cleanup();
  },
  // biome-ignore lint/correctness/noEmptyPattern: see above
  redactor: async ({}, use: (value: Redactor) => Promise<void>) => {
    configureRedaction({});
    const reset = once(() => configureRedaction({}));
    deferCleanup(reset);
    await use(getRedactor());
    await reset();
  },
  // biome-ignore lint/correctness/noEmptyPattern: see above
  runs: async ({}, use) => {
    // loaded on use: a test that never destructures `runs` needs no chat, and a missing one fails here with a sentence
    const { recordRuns } = await requirePeer(() => import("./chat/record-runs"), { peer: "@webmcp-agents/chat", by: "The runs fixture" });
    const log = recordRuns();
    const stop = once(() => log.stop());
    deferCleanup(stop);
    await use(log);
    await stop();
  },
  // biome-ignore lint/correctness/noEmptyPattern: see above
  spans: async ({}, use) => {
    // loaded on use, like `runs`: a missing telemetry package fails here with a sentence naming it
    const { observeSpans } = await requirePeer(() => import("./telemetry/observe-spans"), {
      peer: "@webmcp-agents/telemetry",
      by: "The spans fixture",
    });
    const spans = observeSpans();
    const stop = once(() => spans.stop());
    deferCleanup(stop);
    await use(spans);
    await stop();
  },
});
