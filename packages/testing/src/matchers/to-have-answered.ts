import type { MatcherResult, MatcherState } from "vitest";
import { hint, MatcherInputError, show, textMatches } from "../format";
import { readRun } from "../run-record";

/**
 * The run's answer (the text it replied with) contains this string, matches this RegExp or satisfies this asymmetric
 * matcher. On a `mockAdapter`, its last top-level run's answer (a sub-agent's run is not it).
 *
 * @example
 * expect(run).toHaveAnswered(/back in your cart/i);
 */
export function toHaveAnswered(this: MatcherState, received: unknown, expected: unknown): MatcherResult {
  if (expected === undefined)
    throw new MatcherInputError("toHaveAnswered takes the expected answer: a string it contains, a RegExp or an asymmetric matcher.");
  const run = readRun(received, "toHaveAnswered");
  const answer = run.answer;
  const pass = answer !== undefined && textMatches(this, answer, expected);
  const head = hint(this, "toHaveAnswered", [expected]);
  return {
    pass,
    message: () => {
      if (this.isNot) return `${head}\n\n  Expected the answer not to match ${show(expected)}, but it does.\n  Answer: ${show(answer)}`;
      if (answer === undefined)
        return `${head}\n\n  ${run.source} has no answer: the run ${run.finish ? `ended with "${run.finish.reason}"${run.finish.error ? ` (${run.finish.error})` : ""}` : "has not run"}.`;
      return `${head}\n\n  Expected the answer to match ${show(expected)}.\n  Answer: ${show(answer, 400)}`;
    },
  };
}
