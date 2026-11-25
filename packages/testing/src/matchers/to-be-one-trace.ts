import type { MatcherResult, MatcherState } from "vitest";
import { notYet } from "../not-yet";

/**
 * Every span belongs to one trace, with one root. A typed shell until @webmcp-agents/telemetry exists (0.5.0,
 * phase 5): calling it fails with a sentence saying so.
 *
 * @example
 * expect(spans).toBeOneTrace();
 */
export function toBeOneTrace(this: MatcherState, _received: unknown): MatcherResult {
  return notYet("toBeOneTrace", "telemetry");
}
