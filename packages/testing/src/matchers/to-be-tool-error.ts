import type { MatcherResult, MatcherState } from "vitest";
import { errorCode, hint, isFailed, MatcherInputError, readToolResult, resultText, show } from "../format";

/**
 * The tool result failed (`isError`, or an `Error:` text), and, when `code` is given, with that code
 * (`structuredContent.error.code`, else the `[code]` in `Error [code]: …`).
 *
 * @example
 * expect(await tools.call("add_to_cart", { qty: 0 })).toBeToolError("invalid_input");
 */
export function toBeToolError(this: MatcherState, received: unknown, code?: string): MatcherResult {
  if (code !== undefined && typeof code !== "string") {
    throw new MatcherInputError(`toBeToolError takes an error code string (e.g. "not_found"), got ${show(code)}.`);
  }
  const result = readToolResult(received, "toBeToolError");
  const text = resultText(result);
  const failed = isFailed(result);
  const actual = errorCode(result);
  const pass = failed && (code === undefined || actual === code);
  const head = hint(this, "toBeToolError", code === undefined ? [] : [code]);
  return {
    pass,
    message: () => {
      if (this.isNot) {
        return code === undefined
          ? `${head}\n\n  Expected the call to succeed, but it failed${actual ? ` with code "${actual}"` : ""}.\n  Text: ${show(text)}`
          : `${head}\n\n  Expected the call not to fail with code "${code}", but it did.\n  Text: ${show(text)}`;
      }
      if (!failed)
        return `${head}\n\n  Expected the call to fail${code ? ` with code "${code}"` : ""}, but it succeeded.\n  Text: ${show(text)}`;
      return `${head}\n\n  The call failed, but with ${actual ? `code "${actual}"` : "no error code"}, not "${code}".\n  Text: ${show(text)}`;
    },
  };
}
