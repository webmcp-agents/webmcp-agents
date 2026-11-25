import type { MatcherResult, MatcherState } from "vitest";
import { errorCode, hint, isFailed, readToolResult, resultText, show, textMatches } from "../format";

/**
 * The tool result succeeded (not `isError`, no `Error:` text), and, when `expected` is given, its text contains that
 * string, matches that RegExp or satisfies that asymmetric matcher.
 *
 * @example
 * expect(await tools.call("add_to_cart", { qty: 2 })).toBeToolResult(/2 × Field Mug/);
 */
export function toBeToolResult(this: MatcherState, received: unknown, expected?: unknown): MatcherResult {
  const result = readToolResult(received, "toBeToolResult");
  const text = resultText(result);
  const failed = isFailed(result);
  const textOk = expected === undefined || textMatches(this, text, expected);
  const pass = !failed && textOk;
  const head = hint(this, "toBeToolResult", expected === undefined ? [] : [expected]);
  return {
    pass,
    message: () => {
      if (this.isNot) {
        return expected === undefined
          ? `${head}\n\n  Expected the call to fail, but it succeeded.\n  Text: ${show(text)}`
          : `${head}\n\n  Expected a result whose text does not match ${show(expected)}, but the call succeeded with it.\n  Text: ${show(text)}`;
      }
      if (failed) {
        const code = errorCode(result);
        return `${head}\n\n  Expected the call to succeed, but it failed${code ? ` with code "${code}"` : ""}.\n  Text: ${show(text)}`;
      }
      return `${head}\n\n  The call succeeded, but its text does not match.\n  Expected: ${show(expected)}\n  Text:     ${show(text)}`;
    },
  };
}
