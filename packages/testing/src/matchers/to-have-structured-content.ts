import { expect, type MatcherResult, type MatcherState } from "vitest";
import { hint, kindOf, MatcherInputError, readToolResult, show } from "../format";

/**
 * The tool result's `structuredContent` has these keys with these values (a partial match: other keys may be there).
 *
 * @example
 * expect(await tools.call("cart_total")).toHaveStructuredContent({ total: 48 });
 */
export function toHaveStructuredContent(this: MatcherState, received: unknown, expected: Record<string, unknown>): MatcherResult {
  if (typeof expected !== "object" || expected === null || Array.isArray(expected)) {
    throw new MatcherInputError(`toHaveStructuredContent takes an object of the keys to check, got ${kindOf(expected)}.`);
  }
  const result = readToolResult(received, "toHaveStructuredContent");
  const actual = result.structuredContent;
  const pass = actual !== undefined && this.equals(actual, expect.objectContaining(expected));
  const head = hint(this, "toHaveStructuredContent", [expected]);
  return {
    pass,
    message: () => {
      if (this.isNot)
        return `${head}\n\n  Expected structuredContent not to match ${show(expected)}, but it does.\n  structuredContent: ${show(actual)}`;
      if (actual === undefined) return `${head}\n\n  The result has no structuredContent.\n  Expected: ${show(expected)}`;
      const differing = Object.keys(expected).filter((k) => !this.equals((actual as Record<string, unknown>)[k], expected[k]));
      return (
        `${head}\n\n  structuredContent differs at ${differing.map((k) => `"${k}"`).join(", ")}.\n` +
        differing.map((k) => `  ${k}: expected ${show(expected[k])}, got ${show((actual as Record<string, unknown>)[k])}`).join("\n")
      );
    },
  };
}
