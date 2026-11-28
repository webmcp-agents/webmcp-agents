import { expect, type MatcherResult, type MatcherState } from "vitest";
import { hint, MatcherInputError, show } from "../format";
import { readRun } from "../run-record";

/**
 * The run called `tool`, with an input that contains `input` when given (a partial match: other keys may be there).
 * Reads a `WebAgentResult`, a `mockAdapter` or the `runs` fixture's `RunLog`. The error `agent.invoke` rejected with
 * carries no calls, so it is refused (a negated call would pass on nothing): assert on the `mockAdapter` instead.
 *
 * @example
 * expect(run).toHaveCalledTool("add_to_cart", { qty: 2 });
 * expect(run).not.toHaveCalledTool("place_order");
 */
export function toHaveCalledTool(this: MatcherState, received: unknown, tool: string, input?: Record<string, unknown>): MatcherResult {
  if (typeof tool !== "string") throw new MatcherInputError(`toHaveCalledTool takes the tool's name first, got ${show(tool)}.`);
  const run = readRun(received, "toHaveCalledTool");
  const named = run.calls.filter((c) => c.name === tool);
  const matches = (value: unknown): boolean =>
    typeof input === "object" && input !== null ? this.equals(value, expect.objectContaining(input)) : this.equals(value, input);
  const hits = input === undefined ? named : named.filter((c) => matches(c.input));
  const called = run.calls.map((c) => c.name).join(" → ") || "(no tools)";
  const head = hint(this, "toHaveCalledTool", input === undefined ? [tool] : [tool, input]);
  return {
    pass: hits.length > 0,
    message: () => {
      if (this.isNot) {
        return `${head}\n\n  Expected "${tool}" not to be called${input === undefined ? "" : ` with ${show(input)}`}, but ${run.source} called it ${hits.length} time(s).\n  ${tool} input: ${show(hits[0]?.input)}\n  Called: ${called}`;
      }
      if (!named.length) return `${head}\n\n  Expected "${tool}" to be called, but ${run.source} never called it.\n  Called: ${called}`;
      return `${head}\n\n  "${tool}" was called, but not with ${show(input)}.\n${named.map((c) => `  ${tool} input: ${show(c.input)}`).join("\n")}`;
    },
  };
}
