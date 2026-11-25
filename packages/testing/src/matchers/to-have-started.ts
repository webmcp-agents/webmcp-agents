import type { MatcherResult, MatcherState } from "vitest";
import { hint, listEvents, readEvents } from "../format";

/**
 * A tool run started (a `start` event), for `tool` when given.
 *
 * @example
 * expect(events).toHaveStarted("place_order");
 */
export function toHaveStarted(this: MatcherState, received: unknown, tool?: string): MatcherResult {
  const events = readEvents(received, "toHaveStarted");
  const starts = events.filter((e) => e.type === "start" && (tool === undefined || e.tool === tool));
  const head = hint(this, "toHaveStarted", tool === undefined ? [] : [tool]);
  return {
    pass: starts.length > 0,
    message: () =>
      this.isNot
        ? `${head}\n\n  Expected no run of ${tool ? `"${tool}"` : "any tool"} to start, but it started ${starts.length} time(s).\n  Events:\n${listEvents(events)}`
        : `${head}\n\n  Expected a run of ${tool ? `"${tool}"` : "a tool"} to start, but none did.\n  Events:\n${listEvents(events)}`,
  };
}
