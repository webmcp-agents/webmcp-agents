/**
 * Sink 7 (design §8.3) in core: a console line that prints a caught value prints it through the page's redactor.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { emit, onAgentEvent } from "../events";
import { configureRedaction } from "./index";
import { forLog } from "./slot";

const SECRET = "sk-abcdefghijklmnopqrstuvwx";

describe("core's console lines", () => {
  afterEach(() => {
    configureRedaction({});
    vi.restoreAllMocks();
  });

  it("an event listener's error is printed as its redacted message", () => {
    configureRedaction({});
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const off = onAgentEvent(() => {
      throw new Error(`provider said: bad key ${SECRET} for sara@example.com`);
    });
    emit({ type: "resume" });
    off();
    const line = printed.mock.calls.flat().map(String).join(" ");
    expect(line).toContain("[web-agents] agent event listener threw");
    expect(line).not.toContain(SECRET);
    expect(line).not.toContain("sara@example.com");
  });

  it("follows the rules configured later, and never throws", () => {
    configureRedaction({ keys: [], patterns: { order: { pattern: /ORD-\d+/, label: "ORDER" } } });
    expect(forLog(new Error("lost ORD-12"))).toBe("lost [REDACTED]");
    expect(forLog(Object.create(null))).toBe("[REDACTED]");
  });
});
