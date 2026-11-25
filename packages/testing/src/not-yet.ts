/**
 * Parts of the kit whose subject has not landed yet. They are typed and safe to import; using one fails with a
 * sentence that says what it needs and when it arrives, never with `undefined is not a function`.
 */

/** Which later piece of 0.5.0 a shell waits for. */
export type PendingPart = "run-events" | "telemetry" | "chat-theming";

const ARRIVES: Record<PendingPart, string> = {
  "run-events": "the chat's run events (AgentRunEvent, onAgentRun), phase 4 of 0.5.0",
  telemetry: "@webmcp-agents/telemetry, phase 5 of 0.5.0",
  "chat-theming": "the chat's messages catalog and slots, phase 3 of 0.5.0",
};

/** The error a shell throws: what was called, what it needs, when that arrives. */
export class NotYetAvailableError extends Error {
  override name = "NotYetAvailableError";
  constructor(
    /** The kit export that was used, e.g. `"spans"` or `"toHaveSpan"`. */
    readonly feature: string,
    /** What it waits for. */
    readonly part: PendingPart,
  ) {
    super(`${feature} is not available yet: it needs ${ARRIVES[part]}, which this version of @webmcp-agents/testing does not have.`);
  }
}

/** Throw {@link NotYetAvailableError} for `feature`. */
export function notYet(feature: string, part: PendingPart): never {
  throw new NotYetAvailableError(feature, part);
}
