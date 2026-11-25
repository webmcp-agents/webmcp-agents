import { defineWebTool } from "@webmcp-agents/core";
import { z } from "zod";
import { describe, expect } from "vitest";
import { isRunLog } from "../src/run-record";
import { test } from "../src/test";

const addToCart = defineWebTool({
  id: "add_to_cart",
  description: "Add mugs to the cart.",
  inputSchema: z.object({ qty: z.number().int().min(1) }),
  execute: async ({ qty }) => `Added ${qty} × Field Mug`,
});

describe("fixtures are lazy", () => {
  test("a Node test that destructures nothing sets up no browser fixture", () => {
    expect(typeof document).toBe("undefined");
  });

  test("tools works in Node: a defined tool runs in-process, a schema error is a result", async ({ tools }) => {
    expect(await tools.call(addToCart, { qty: 2 })).toBeToolResult("Added 2 × Field Mug");
    expect(await tools.call(addToCart, { qty: 0 })).toBeToolError("invalid_input");
    expect(await tools.list()).toEqual([]);
    await expect(tools.call("add_to_cart")).rejects.toThrow("needs a page with WebMCP");
  });

  test("mount and user say they need browser mode", async ({ mount }) => {
    expect(() => mount("<p>x</p>")).toThrow("mount() needs a page: run this test in browser mode");
  });

  test("the runs fixture loads in Node too: an empty log until a run happens", ({ runs }) => {
    expect(runs.events).toEqual([]);
    expect(runs.runIds()).toEqual([]);
    expect(isRunLog(runs)).toBe(true);
  });
});
