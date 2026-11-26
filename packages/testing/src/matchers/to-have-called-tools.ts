import type { MatcherResult, MatcherState } from "vitest";
import { hint, MatcherInputError, show } from "../format";
import { readRun } from "../run-record";

/**
 * The run called exactly these tools, in this order (no other call before, between or after). Reads what
 * `toHaveCalledTool` reads; the error `agent.invoke` rejected with carries no calls, so it is refused.
 *
 * @example
 * expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);
 */
export function toHaveCalledTools(this: MatcherState, received: unknown, tools: string[]): MatcherResult {
  if (!Array.isArray(tools) || !tools.every((t) => typeof t === "string")) {
    throw new MatcherInputError(
      `toHaveCalledTools takes the tool names in order, e.g. ["track_last_order", "add_to_cart"], got ${show(tools)}.`,
    );
  }
  const run = readRun(received, "toHaveCalledTools");
  const names = run.calls.map((c) => c.name);
  const pass = names.length === tools.length && names.every((n, i) => n === tools[i]);
  const head = hint(this, "toHaveCalledTools", [tools]);
  return {
    pass,
    message: () => {
      const expected = tools.join(" → ") || "(no tools)";
      const called = names.join(" → ") || "(no tools)";
      if (this.isNot) return `${head}\n\n  Expected the run not to call exactly ${expected}, but it did.`;
      const lines = [`${head}`, "", `  Expected tools, in order:  ${expected}`, `  Called:                    ${called}`];
      // the first place they part: point at it, name the call that should not be there, print its input
      const at = names.findIndex((n, i) => n !== tools[i]);
      if (at >= 0) {
        const offset = 29 + names.slice(0, at).reduce((w, n) => w + n.length + 3, 0);
        lines.push(`${" ".repeat(offset)}^ ${tools.includes(names[at]!) ? "out of order" : "unexpected"}`);
        lines.push(`  ${names[at]} input: ${show(run.calls[at]!.input)}`);
      } else {
        lines.push(`  Missing: ${tools.slice(names.length).join(" → ")}`);
      }
      return lines.join("\n");
    },
  };
}
