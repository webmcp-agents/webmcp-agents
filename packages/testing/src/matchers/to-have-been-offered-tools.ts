import { expect, type MatcherResult, type MatcherState } from "vitest";
import { hint, isAsymmetric, kindOf, MatcherInputError, show } from "../format";
import { RUN_RECORD, type RunRecord } from "../run-record";

/**
 * Every model step of the mock adapter's runs was offered these tools: a list (each was offered; others may be too)
 * or an asymmetric matcher over the names (`expect.not.arrayContaining(["place_order"])`).
 *
 * @example
 * expect(adapter).toHaveBeenOfferedTools(["search_products", "add_to_cart"]);
 * expect(adapter).toHaveBeenOfferedTools(expect.not.arrayContaining(["place_order"]));
 */
export function toHaveBeenOfferedTools(this: MatcherState, received: unknown, expected: unknown): MatcherResult {
  const record = (received as { [RUN_RECORD]?: RunRecord } | null)?.[RUN_RECORD];
  if (!record)
    throw new MatcherInputError(
      `toHaveBeenOfferedTools needs a mockAdapter (it records what each step was offered), got ${kindOf(received)}.`,
    );
  if (!Array.isArray(expected) && !isAsymmetric(expected)) {
    throw new MatcherInputError(`toHaveBeenOfferedTools takes a list of tool names or an asymmetric matcher, got ${show(expected)}.`);
  }
  const matcher = Array.isArray(expected) ? expect.arrayContaining(expected) : expected;
  const steps = record.offered;
  const bad = steps.findIndex((names) => !this.equals(names, matcher));
  const pass = steps.length > 0 && bad === -1;
  const head = hint(this, "toHaveBeenOfferedTools", [expected]);
  return {
    pass,
    message: () => {
      if (!steps.length) return `${head}\n\n  The mock adapter has not run: no model step was offered any tools yet.`;
      if (this.isNot)
        return `${head}\n\n  Expected some step not to be offered ${show(expected)}, but every step was.\n  Step 1 offered: ${steps[0]!.join(", ") || "(none)"}`;
      const names = steps[bad]!;
      const missing = Array.isArray(expected) ? expected.filter((n) => !names.includes(n)) : [];
      return `${head}\n\n  Model step ${bad + 1} of ${steps.length} was offered: ${names.join(", ") || "(no tools)"}${missing.length ? `\n  Missing: ${missing.join(", ")}` : ""}`;
    },
  };
}
