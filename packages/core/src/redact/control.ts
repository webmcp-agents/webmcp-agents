/**
 * The two pieces of redaction the visual layer needs: is this control's value secret, and how to mask one value.
 * Kept apart from the redactor so that `visuals.ts` pulls in only these few bytes (core's size budget).
 */

/**
 * How a redacted value is written.
 * - `"full"`: the token (`"[REDACTED]"` by default).
 * - `"partial"`: the first and last two characters kept (`"4242424242424242"` → `"42••••42"`), so a person can tell
 *   two values apart; a value shorter than 12 characters is fully redacted, since keeping four of them would show
 *   too much of it.
 * - `"indexed"`: a stable token per distinct value within one redactor scope (`"[EMAIL_1]"`, `"[CARD_1]"`), so a
 *   trace still shows which steps used the same value. A single value masked with {@link mask} has no scope and is
 *   written as the token.
 */
export type RedactionStyle = "full" | "partial" | "indexed";

/**
 * Secret controls as one selector, matched by `closest` (the control itself or an ancestor): `type="password"`, an
 * `autocomplete` of `current-password`, `new-password`, `one-time-code` or any payment token (`cc-*`), or the
 * `data-agent-sensitive` marker. Attribute selectors keep the cursor's share of this module small.
 */
const SECRET = "[data-agent-sensitive],[type=password],[autocomplete*=password],[autocomplete*=cc-],[autocomplete*=one-t]";

/**
 * True for a control whose value must never be shown or read out: `type="password"`, an `autocomplete` of
 * `current-password`, `new-password`, `one-time-code` or any payment token (`cc-number`, `cc-csc`, `cc-exp`, `cc-name`…), or the
 * control or one of its ancestors marked `data-agent-sensitive`. The cursor masks such a field's value in the `fill`
 * event, the live region and the spoken text, and withholds its previous value (`from`).
 *
 * Never throws. Answers `false` for anything that is not an element (on the server there is no DOM).
 *
 * @example
 * isSensitiveControl(document.querySelector('input[autocomplete="cc-number"]')!); // true
 */
export function isSensitiveControl(el: Element): boolean {
  return !!el?.closest?.(SECRET);
}

/**
 * Mask one value, with no traversal and no detection: the value is already known to be secret.
 *
 * @param value - The secret. Non-strings are read as text.
 * @param style - Default `"full"`. `"indexed"` has no scope here and is written as `token`.
 * @param token - What replaces the value. Default `"[REDACTED]"`.
 * @example
 * mask("4242424242424242", "partial"); // "42••••42"
 * mask("hunter2");                     // "[REDACTED]"
 */
export function mask(value: string, style: RedactionStyle = "full", token = "[REDACTED]"): string {
  const s = String(value);
  return style === "partial" && s.length > 11 ? `${s.slice(0, 2)}••••${s.slice(-2)}` : token;
}
