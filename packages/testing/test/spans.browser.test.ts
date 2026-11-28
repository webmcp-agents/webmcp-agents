/** The `spans` fixture: every browser span of the test, in memory, with `flush()` for the buffered ones. */
import { defineWebAgent } from "@webmcp-agents/chat";
import { describe, expect } from "vitest";
import { mockAdapter, text } from "../src/chat";
import { test } from "../src/test";

describe("the spans fixture", () => {
  test("records a run's spans, redacted, as one trace", async ({ spans }) => {
    const agent = defineWebAgent({ id: "kit", instructions: "Answer." });
    await agent.invoke("My card is 4242 4242 4242 4242.", { adapter: mockAdapter([text("Noted.")]) });
    await spans.flush();
    expect(spans).toHaveSpan("invoke_agent kit", { "webmcp.run.reason": "stop" });
    expect(spans).toBeOneTrace();
    expect(spans).not.toContainSensitive(["4242"]);
  });

  test("a test that does not destructure it observes nothing", async ({ events }) => {
    expect(events.events).toEqual([]);
  });
});
