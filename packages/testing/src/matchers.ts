/**
 * `@webmcp-agents/testing/matchers`: registers the kit's matchers on Vitest's `expect` and declares their types. List
 * it in `setupFiles` (`./setup` imports it, and so does the main entry), and every test file gets them.
 */
import { expect } from "vitest";
import type { FinishReason } from "./run-record";
import { toBeOneTrace } from "./matchers/to-be-one-trace";
import { toBeToolError } from "./matchers/to-be-tool-error";
import { toBeToolResult } from "./matchers/to-be-tool-result";
import { toContainSensitive } from "./matchers/to-contain-sensitive";
import { toHaveAnswered } from "./matchers/to-have-answered";
import { toHaveBeenOfferedTools } from "./matchers/to-have-been-offered-tools";
import { toHaveCalledTool } from "./matchers/to-have-called-tool";
import { toHaveCalledTools } from "./matchers/to-have-called-tools";
import { toHaveEventOrder } from "./matchers/to-have-event-order";
import { toHaveFilled } from "./matchers/to-have-filled";
import { toHaveFinishedWith } from "./matchers/to-have-finished-with";
import { type NoHardcodedTextOptions, toHaveNoHardcodedText } from "./matchers/to-have-no-hardcoded-text";
import { toHaveParked } from "./matchers/to-have-parked";
import { toHaveSpan } from "./matchers/to-have-span";
import { toHaveStarted } from "./matchers/to-have-started";
import { toHaveStructuredContent } from "./matchers/to-have-structured-content";
import { toHaveYielded } from "./matchers/to-have-yielded";

/** Every matcher of the kit, by name: what `expect.extend` receives. */
export const webAgentsMatchers = {
  toBeToolResult,
  toBeToolError,
  toHaveStructuredContent,
  toHaveStarted,
  toHaveFilled,
  toHaveParked,
  toHaveYielded,
  toHaveEventOrder,
  toHaveCalledTool,
  toHaveCalledTools,
  toHaveAnswered,
  toHaveFinishedWith,
  toHaveBeenOfferedTools,
  toHaveSpan,
  toBeOneTrace,
  toContainSensitive,
  toHaveNoHardcodedText,
};

expect.extend(webAgentsMatchers);

/** The kit's matchers, as `expect(…)` sees them. */
export interface WebAgentsMatchers<R = unknown> {
  /** Succeeded (not `isError`, no `Error:` text); its text contains / matches `expected` when given. */
  toBeToolResult(expected?: string | RegExp | unknown): R;
  /** Failed; with that error code when given (`structuredContent.error.code` or `Error [code]:`). */
  toBeToolError(code?: string): R;
  /** `structuredContent` has these keys with these values (partial match). */
  toHaveStructuredContent(expected: Record<string, unknown>): R;
  /** A run of `tool` (any tool when omitted) started. */
  toHaveStarted(tool?: string): R;
  /** The agent filled `field` (with `value` when given). */
  toHaveFilled(field: string, value?: unknown): R;
  /** A tool (`tool` when given) waited for the person, with a prompt matching `prompt` when given. */
  toHaveParked(tool?: string, prompt?: string | RegExp): R;
  /** The cursor yielded to the person (for `reason` when given). */
  toHaveYielded(reason?: string): R;
  /** These event types happened in this order (others may come between). */
  toHaveEventOrder(order: string[]): R;
  /** The run called `tool`, with an input containing `input` when given. */
  toHaveCalledTool(tool: string, input?: Record<string, unknown>): R;
  /** The run called exactly these tools, in this order. */
  toHaveCalledTools(tools: string[]): R;
  /** The run's answer contains / matches `expected`. */
  toHaveAnswered(expected: string | RegExp | unknown): R;
  /** The run ended with `reason` (and the adapter's error `code`, when given). */
  toHaveFinishedWith(reason: FinishReason, code?: string): R;
  /** Every model step of the mock adapter was offered these tools (or the names satisfy the asymmetric matcher). */
  toHaveBeenOfferedTools(expected: string[] | unknown): R;
  /** A span named `name` (or matching it) whose attributes include these. Reads a memory exporter or an array of spans. */
  toHaveSpan(name: string | RegExp, attributes?: Record<string, unknown>): R;
  /** Every span is in one trace, with one root. */
  toBeOneTrace(): R;
  /** One of `values` is in this sink (use it negated). Async on a `Response`. */
  toContainSensitive(values: (string | RegExp)[]): R;
  /**
   * The rendered chat (`renderChat({ sentinel: true })`, or an element) shows only catalog markers, punctuation and
   * digits, plus the text in `allow` (the person's and the model's own words).
   */
  toHaveNoHardcodedText(options?: NoHardcodedTextOptions): R;
}

declare module "vitest" {
  // the type parameters must match Vitest's declaration
  interface Matchers<R, T> extends WebAgentsMatchers<R> {}
}
