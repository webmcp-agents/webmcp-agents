import type { MatcherResult, MatcherState } from "vitest";
import { hint, listEvents, MatcherInputError, readEvents, show } from "../format";

/**
 * These event types happened in this order. Other events may come between them (several `fill`s, a `yield`): the
 * list is checked as a subsequence of what happened.
 *
 * @example
 * expect(events).toHaveEventOrder(["start", "fill", "park", "result"]);
 */
export function toHaveEventOrder(this: MatcherState, received: unknown, order: string[]): MatcherResult {
  if (!Array.isArray(order) || !order.every((t) => typeof t === "string")) {
    throw new MatcherInputError(`toHaveEventOrder takes a list of event types, e.g. ["start", "fill", "result"], got ${show(order)}.`);
  }
  const events = readEvents(received, "toHaveEventOrder");
  const types = events.map((e) => e.type as string);
  let at = 0;
  for (const t of types) if (t === order[at]) at++;
  const pass = at === order.length;
  const head = hint(this, "toHaveEventOrder", [order]);
  return {
    pass,
    message: () =>
      this.isNot
        ? `${head}\n\n  Expected the events not to happen in the order ${order.join(" → ")}, but they did.\n  Happened: ${types.join(" → ") || "(nothing)"}`
        : `${head}\n\n  Expected, in order:  ${order.join(" → ")}\n  Happened:           ${types.join(" → ") || "(nothing)"}\n  Missing from "${order[at]}" on (step ${at + 1} of ${order.length}).\n  Events:\n${listEvents(events)}`,
  };
}
