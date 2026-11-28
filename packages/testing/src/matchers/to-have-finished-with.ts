import type { MatcherResult, MatcherState } from "vitest";
import { hint, MatcherInputError, show } from "../format";
import { type FinishReason, readRun } from "../run-record";

const REASONS: FinishReason[] = ["stop", "max-steps", "aborted", "error"];

/**
 * The run ended this way: `"stop"`, `"max-steps"`, `"aborted"` or `"error"`; with `code` too, the adapter's error
 * code (`"rate_limited"`, `"network"`…). A `WebAgentResult` reads as `"stop"` (see the matcher's page); a
 * `mockAdapter` knows exactly (its last top-level run, not a sub-agent's); the error `agent.invoke` rejected with reads as `"error"` (or `"aborted"`).
 *
 * @example
 * expect(adapter).toHaveFinishedWith("error", "rate_limited");
 */
export function toHaveFinishedWith(this: MatcherState, received: unknown, reason: FinishReason, code?: string): MatcherResult {
  if (!REASONS.includes(reason))
    throw new MatcherInputError(`toHaveFinishedWith takes one of ${REASONS.map((r) => `"${r}"`).join(", ")}, got ${show(reason)}.`);
  const run = readRun(received, "toHaveFinishedWith");
  const finish = run.finish;
  const pass = !!finish && finish.reason === reason && (code === undefined || finish.code === code);
  const head = hint(this, "toHaveFinishedWith", code === undefined ? [reason] : [reason, code]);
  const ended = finish
    ? `"${finish.reason}"${finish.code ? ` with code "${finish.code}"` : ""}${finish.error ? ` (${show(finish.error, 120)})` : ""}`
    : "nothing yet: no run finished";
  return {
    pass,
    message: () =>
      this.isNot
        ? `${head}\n\n  Expected the run not to end with "${reason}"${code ? ` and code "${code}"` : ""}, but it did.`
        : `${head}\n\n  Expected the run to end with "${reason}"${code ? ` and code "${code}"` : ""}.\n  It ended with ${ended}, according to ${run.source}.${run.finishNote ? `\n  Note: ${run.finishNote}` : ""}`,
  };
}
