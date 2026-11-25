import type { MatcherResult, MatcherState } from "vitest";
import { notYet } from "../not-yet";

/**
 * The rendered chat shows no text that bypassed its messages catalog (the sentinel-catalog check). A typed shell
 * until the chat's messages catalog lands (0.5.0, phase 3): calling it fails with a sentence saying so.
 *
 * @example
 * await expect(chat).toHaveNoHardcodedText();
 */
export function toHaveNoHardcodedText(this: MatcherState, _received: unknown): MatcherResult {
  return notYet("toHaveNoHardcodedText", "chat-theming");
}
