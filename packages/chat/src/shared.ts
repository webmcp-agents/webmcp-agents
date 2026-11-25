/** Small pieces several modules agree on. Pure: the server imports them too. */

/** What a tool call the user stopped answers (code `cancelled`); the session shows it as cancelled, not failed. */
export const CANCELLED = "Error [cancelled]: Cancelled by the user.";

/** True for a tool error that is a cancellation (also the uncoded text conversations saved before codes carried). */
export const isCancelled = (text: string): boolean => text.startsWith("Error [cancelled]") || text.startsWith("Cancelled by the user");

/** What a call to a tool that isn't on the page answers (code `unavailable`): from the page, or from the server. */
export const notOnPage = (tool: string): string =>
  `Error [unavailable]: Tool "${tool}" is not on this page right now. Use a tool you have to get to the page that has it.`;

/**
 * A readable model name from an id: "anthropic/claude-opus-5-5" → "Claude Opus 5.5", "openai/gpt-5.5" → "GPT-5.5",
 * "openrouter/deepseek/deepseek-v4" → "DeepSeek V4 via OpenRouter". Client-safe (the cloud adapter labels itself with it).
 */
export function displayName(id: string): string {
  const segments = id.split("/");
  const via = segments.length > 2 && segments[0] === "openrouter" ? " via OpenRouter" : "";
  const model = segments.at(-1) ?? id;
  const name = model
    // version digits joined by a dash read as a dot: claude-opus-5-5 → 5.5, gpt-5-mini stays
    .replace(/(\d)-(\d)(?![\w.-]*\d-\d)/g, "$1.$2")
    .split("-")
    .filter(Boolean)
    .map((w) => (/^gpt$/i.test(w) ? "GPT" : /^v\d/i.test(w) || /^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/^GPT (\S+)/, "GPT-$1")
    .replace(/\bDeepseek\b/g, "DeepSeek");
  return `${name}${via}`;
}

let counter = 0;
/**
 * Where a test kit puts its id source (`@webmcp-agents/testing/setup` does): a function from prefix to id, so a test
 * makes the same ids every run. `Symbol.for`, so every copy of this package (source and dist) reads the same slot.
 */
const ID_SLOT = Symbol.for("web-agents.ids");

/** A unique message id: `prefix-<time>-<n>`, or the installed test id source's (`u-1`, `a-1`…). */
export const newId = (prefix: string): string =>
  (globalThis as { [ID_SLOT]?: (prefix: string) => string })[ID_SLOT]?.(prefix) ??
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Caps on a request. Generous enough for long chats (the client trims the oldest messages past `messages`). */
export const LIMITS = {
  bodyBytes: 1024 * 1024,
  messages: 160,
  parts: 40,
  text: 8000,
  reasoning: 32_000,
  tools: 48,
  description: 1024,
  schemaBytes: 8192,
} as const;
