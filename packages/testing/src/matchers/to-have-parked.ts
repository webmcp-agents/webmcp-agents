import type { AgentEvent } from "@webmcp-agents/core";
import type { MatcherResult, MatcherState } from "vitest";
import { hint, listEvents, readEvents, show, textMatches } from "../format";

/**
 * A tool waited for the person (a `park` event: a confirmation, a question), `tool` when given, with a prompt that
 * contains / matches `prompt` when given.
 *
 * @example
 * await expect.poll(() => events).toHaveParked("place_order");
 */
export function toHaveParked(this: MatcherState, received: unknown, tool?: string, prompt?: unknown): MatcherResult {
  const events = readEvents(received, "toHaveParked");
  const parks = events.filter((e): e is Extract<AgentEvent, { type: "park" }> => e.type === "park");
  const hits = parks.filter(
    (e) => (tool === undefined || e.tool === tool) && (prompt === undefined || textMatches(this, e.prompt, prompt)),
  );
  const args = [tool, prompt].filter((a) => a !== undefined);
  const head = hint(this, "toHaveParked", args);
  return {
    pass: hits.length > 0,
    message: () => {
      if (this.isNot) {
        return `${head}\n\n  Expected no tool to wait for the person, but ${hits.map((e) => `"${e.tool}" parked with the prompt ${show(e.prompt)}`).join("; ")}.`;
      }
      if (!parks.length)
        return `${head}\n\n  Expected ${tool ? `"${tool}"` : "a tool"} to wait for the person, but nothing parked.\n  Events:\n${listEvents(events)}`;
      return `${head}\n\n  Expected ${tool ? `"${tool}"` : "a tool"} to park${prompt === undefined ? "" : ` with a prompt matching ${show(prompt)}`}; what parked: ${parks.map((e) => `"${e.tool}" (${show(e.prompt)})`).join(", ")}.`;
    },
  };
}
