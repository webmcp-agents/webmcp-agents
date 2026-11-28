/**
 * Runs in a browser project whose only setup file is `@webmcp-agents/testing/matchers`: the kit installs no polyfill,
 * so "no WebMCP" behavior can be tested. Named `.check.ts` so the default browser project does not pick it up.
 */
import { describe, expect, it } from "vitest";

describe("a page without the polyfill", () => {
  it("has no document.modelContext, and the matchers are registered", () => {
    expect(document.modelContext).toBeUndefined();
    expect({ content: [{ type: "text", text: "ok" }] }).toBeToolResult("ok");
  });
});
