import type { AgentEvent } from "@webmcp-agents/core";
import type { MatcherResult, MatcherState } from "vitest";
import { hint, listEvents, readEvents } from "../format";

/**
 * The cursor got out of the person's way (a `yield` event), for `reason` when given (`"pointer"`, `"keyboard"`,
 * `"scroll"`…).
 *
 * @example
 * expect(events).toHaveYielded();
 */
export function toHaveYielded(this: MatcherState, received: unknown, reason?: string): MatcherResult {
  const events = readEvents(received, "toHaveYielded");
  const yields = events.filter((e): e is Extract<AgentEvent, { type: "yield" }> => e.type === "yield");
  const hits = yields.filter((e) => reason === undefined || e.reason === reason);
  const head = hint(this, "toHaveYielded", reason === undefined ? [] : [reason]);
  return {
    pass: hits.length > 0,
    message: () => {
      if (this.isNot)
        return `${head}\n\n  Expected the cursor not to yield${reason ? ` for "${reason}"` : ""}, but it yielded (${hits.map((e) => e.reason).join(", ")}).`;
      if (!yields.length)
        return `${head}\n\n  Expected the cursor to yield to the person, but it never did.\n  Events:\n${listEvents(events)}`;
      return `${head}\n\n  The cursor yielded for ${yields.map((e) => `"${e.reason}"`).join(", ")}, not "${reason}".`;
    },
  };
}
