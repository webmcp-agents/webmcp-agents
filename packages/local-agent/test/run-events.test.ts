/**
 * R-RUN-2 for the on-device adapter: a run through `createLocalAdapter` delivers the same run events as a cloud run,
 * and its `step-finish` carries timing, never usage (there is no server to count tokens).
 */
import { defineWebAgent } from "@webmcp-agents/chat";
import { recordRuns } from "@webmcp-agents/testing/chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdapter } from "../src/index";
import type { LocalProvider } from "../src/types";

/** A stand-in page: one WebMCP tool, `add_to_cart`, answering "Added 2." */
const modelContext = {
  getTools: async () => [
    { name: "add_to_cart", description: "Add mugs to the cart.", inputSchema: { type: "object", properties: { qty: { type: "number" } } } },
  ],
  executeTool: async () => ({ content: [{ type: "text", text: "Added 2." }] }),
  addEventListener: () => {},
  removeEventListener: () => {},
};

// `agent.invoke` runs where there is a page: just enough of one for the loop
beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { title: "Shop", querySelectorAll: () => [], querySelector: () => null, modelContext });
});
afterEach(() => vi.unstubAllGlobals());

/** A provider that answers `replies` in order. */
function provider(replies: string[]): LocalProvider {
  let n = 0;
  return {
    id: "fake",
    label: "Fake",
    availability: async () => ({ state: "available" }),
    prepare: async () => {},
    generate: async () => ({ text: replies[Math.min(n++, replies.length - 1)]! }),
  };
}

async function ready(adapter: ReturnType<typeof createLocalAdapter>) {
  adapter.status!();
  for (let i = 0; i < 20 && adapter.status!().state !== "ready"; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("run events from an on-device run", () => {
  it("delivers the same sequence as a cloud run, with no usage on step-finish", async () => {
    const adapter = createLocalAdapter({
      providers: [provider(['<tool_call>{"name":"add_to_cart","arguments":{"qty":2}}</tool_call>', "Done."])],
    });
    await ready(adapter);
    const log = recordRuns();
    try {
      const agent = defineWebAgent({ id: "shopper", instructions: "Shop." });
      const run = agent.invoke("Add two mugs", { adapter }).catch((e: unknown) => e);
      expect(await run).toMatchObject({ text: expect.stringContaining("Done.") });
    } finally {
      log.stop();
    }
    expect(log.types()).toEqual([
      "run-start",
      "step-start",
      "step-finish",
      "tool-start",
      "tool-finish",
      "step-start",
      "step-finish",
      "run-finish",
    ]);
    expect(log.events.find((e) => e.type === "tool-finish")).toMatchObject({ tool: "add_to_cart", state: "done" });
    for (const e of log.events.filter((x) => x.type === "step-finish")) {
      expect(e).not.toHaveProperty("usage");
      expect(e).toMatchObject({ ms: expect.any(Number) });
    }
    expect(log.events[0]).toMatchObject({ adapter: adapter.id, agent: "shopper" });
  });
});
