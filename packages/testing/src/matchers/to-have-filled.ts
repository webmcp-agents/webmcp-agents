import type { AgentEvent } from "@webmcp-agents/core";
import type { MatcherResult, MatcherState } from "vitest";
import { hint, listEvents, MatcherInputError, readEvents, show } from "../format";

/**
 * The agent's value went into `field` (a `fill` event: a form control's `name`, or a tool parameter's), and, when
 * `value` is given, that value (compared as is, or as text: `"2"` matches `2`).
 *
 * @example
 * expect(events).toHaveFilled("qty", "2");
 */
export function toHaveFilled(this: MatcherState, received: unknown, field: string, value?: unknown): MatcherResult {
  if (typeof field !== "string") throw new MatcherInputError(`toHaveFilled takes the field's name first, got ${show(field)}.`);
  const events = readEvents(received, "toHaveFilled");
  const fills = events.filter((e): e is Extract<AgentEvent, { type: "fill" }> => e.type === "fill" && e.field === field);
  const same = (v: unknown): boolean => this.equals(v, value) || (typeof value !== "object" && String(v) === String(value));
  const hits = value === undefined ? fills : fills.filter((e) => same(e.value));
  const head = hint(this, "toHaveFilled", value === undefined ? [field] : [field, value]);
  return {
    pass: hits.length > 0,
    message: () => {
      if (this.isNot)
        return `${head}\n\n  Expected "${field}" not to be filled${value === undefined ? "" : ` with ${show(value)}`}, but it was.\n  Events:\n${listEvents(events)}`;
      if (!fills.length)
        return `${head}\n\n  Expected "${field}" to be filled, but no fill went into it.\n  Events:\n${listEvents(events)}`;
      return `${head}\n\n  "${field}" was filled with ${fills.map((e) => show(e.value, 40)).join(", ")}, not ${show(value)}.`;
    },
  };
}
