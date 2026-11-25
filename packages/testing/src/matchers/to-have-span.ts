import type { MatcherResult, MatcherState } from "vitest";
import { notYet } from "../not-yet";

/**
 * The spans include one named `name` with these attributes. A typed shell until @webmcp-agents/telemetry exists
 * (0.5.0, phase 5): calling it fails with a sentence saying so.
 *
 * @example
 * expect(spans).toHaveSpan("execute_tool add_to_cart", { "webmcp.tool.confirm": "accepted" });
 */
export function toHaveSpan(this: MatcherState, _received: unknown, _name: string, _attributes?: Record<string, unknown>): MatcherResult {
  return notYet("toHaveSpan", "telemetry");
}
