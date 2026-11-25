import { describe, expect } from "vitest";
import { renderChat } from "../src/chat";
import { NotYetAvailableError } from "../src/not-yet";
import { memoryExporter, spanTree } from "../src/telemetry";
import { test } from "../src/test";

/** The shells for later phases: safe to import, and each says what it needs when used. */
describe("shells for phases 3, 4 and 5", () => {
  test("the telemetry entry imports, and its functions say they need the telemetry package", () => {
    expect(() => memoryExporter()).toThrow(NotYetAvailableError);
    expect(() => memoryExporter()).toThrow("memoryExporter() is not available yet: it needs @webmcp-agents/telemetry, phase 5 of 0.5.0");
    expect(() => spanTree([])).toThrow(/spanTree\(\) is not available yet/);
  });

  test("the span matchers and toHaveNoHardcodedText say when they arrive", () => {
    expect(() => expect([]).toHaveSpan("execute_tool x")).toThrow("toHaveSpan is not available yet: it needs @webmcp-agents/telemetry");
    expect(() => expect([]).toBeOneTrace()).toThrow(/toBeOneTrace is not available yet/);
    expect(() => expect(null).toHaveNoHardcodedText()).toThrow(
      "toHaveNoHardcodedText is not available yet: it needs the chat's messages catalog",
    );
  });

  test("renderChat says it needs the messages catalog", async () => {
    await expect(renderChat()).rejects.toThrow(
      "renderChat() is not available yet: it needs the chat's messages catalog and slots, phase 3 of 0.5.0",
    );
  });

  test.fails("destructuring runs fails the test with a sentence (phase 4)", ({ runs }) => {
    expect(runs).toBeDefined();
  });

  test.fails("destructuring spans fails the test with a sentence (phase 5)", ({ spans }) => {
    expect(spans).toBeDefined();
  });
});
