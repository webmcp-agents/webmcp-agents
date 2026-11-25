/**
 * A production build (its own Vitest project, NODE_ENV "production"): no "Reveal values", no values kept unredacted.
 */
import { defineWebTool, registerWebTool } from "@webmcp-agents/core";
import { afterEach, expect, it } from "vitest";
import { createDevtoolsStore } from "./store";
import { modelContext, uniqueName } from "@webmcp-agents/testing";

const offs: Array<() => void> = [];
afterEach(() => {
  for (const off of offs.splice(0)) off();
});

it("cannot reveal, and keeps nothing unredacted", async () => {
  modelContext();
  const store = createDevtoolsStore();
  const id = uniqueName("prod_pay");
  offs.push(
    registerWebTool(
      defineWebTool({
        id,
        description: "Pay",
        inputSchema: { type: "object", properties: { cvc: { type: "string" } } },
        execute: () => "ok",
      }),
    ),
  );
  await modelContext().executeTool(id, { cvc: "123" });
  const call = store.getSnapshot().calls.find((c) => c.tool === id);
  expect(store.getSnapshot().canReveal).toBe(false);
  store.setRevealed(true);
  expect(store.getSnapshot().revealed).toBe(false);
  expect(call && store.raw(call.id)).toBeUndefined();
  expect(store.shown(id, { cvc: "123" })).toEqual({ cvc: "[REDACTED]" });
  store.destroy();
});
