/**
 * A model's turns, scripted. `mockAdapter` (the browser side), `mockModel` (the server side) and `mockChatServer`
 * (both) play the same steps: one step is one model call.
 *
 *   mockAdapter([toolCall("track_last_order"), toolCall("add_to_cart", { qty: 2 }), text("Back in your cart.")]);
 */

/** Token usage a step reports. */
export interface StepUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** One tool call in a step. */
export interface StepCall {
  /** The call id. Default: the next `call-<n>` (deterministic under `./setup`). */
  id?: string;
  name: string;
  input?: unknown;
}

/** A failure the adapter reports instead of a model turn. */
export interface StepError {
  /** The chat's error code: `rate_limited`, `network`, `chat_disabled`, `bad_request`. */
  code?: "chat_disabled" | "rate_limited" | "bad_request" | "network";
  /** The error's text. Default: a sentence naming the code. */
  message?: string;
}

/**
 * One model call: some reasoning, some text, tool calls, or an error. A step with tool calls continues the run (the
 * calls run on the page, the next step follows); a step without ends it.
 */
export interface Step {
  /** The reply's text. */
  text?: string;
  /** Reasoning kept with the reply (Claude's signed thinking). */
  reasoning?: { text: string; signature?: string };
  /** Tool calls, in order. */
  calls?: StepCall[];
  /** Fail instead (the run ends with `error` and this code). */
  error?: StepError;
  /** Stream the text in this many pieces. Default: word by word. */
  chunks?: number;
  /** Wait this long between pieces. Default 0. */
  delayMs?: number;
  /** What the step reports it used. Default `{ inputTokens: 10, outputTokens: 5 }`. */
  usage?: StepUsage;
}

/** A step, or several merged into one model call (`[reasoning("…"), toolCall("x")]`). */
export type StepInput = Step | Step[];

/** Options for {@link text}. */
export type TextOptions = Pick<Step, "chunks" | "delayMs" | "usage">;

/** A step that answers `content` (and ends the run). */
export const text = (content: string, options: TextOptions = {}): Step => ({ text: content, ...options });

/** A step that calls `name` with `input` (and continues the run). */
export const toolCall = (name: string, input: unknown = {}, options: { id?: string } = {}): Step => ({
  calls: [{ name, input, ...(options.id ? { id: options.id } : {}) }],
});

/** A step's reasoning. Merge it with the step it belongs to: `[reasoning("Let me check."), toolCall("x")]`. */
export const reasoning = (content: string, options: { signature?: string } = {}): Step => ({
  reasoning: { text: content, signature: options.signature ?? "sig" },
});

const MESSAGES: Record<NonNullable<StepError["code"]>, string> = {
  rate_limited: "Too many requests: try again in a minute.",
  network: "Couldn't reach the assistant.",
  chat_disabled: "Chat is not configured on the server.",
  bad_request: "The request was refused.",
};

/** A step that fails with `code`: the run ends with `error` and that code. */
export const fail = (code: NonNullable<StepError["code"]>, message?: string): Step => ({
  error: { code, message: message ?? MESSAGES[code] ?? `Failed: ${code}.` },
});

/** Merge a {@link StepInput} into one step (texts joined, calls concatenated, the last error / options win). */
export function toStep(input: StepInput): Step {
  if (!Array.isArray(input)) return input;
  const step: Step = {};
  for (const s of input) {
    if (s.text !== undefined) step.text = (step.text ?? "") + s.text;
    if (s.reasoning) step.reasoning = s.reasoning;
    if (s.calls) step.calls = [...(step.calls ?? []), ...s.calls];
    if (s.error) step.error = s.error;
    if (s.chunks !== undefined) step.chunks = s.chunks;
    if (s.delayMs !== undefined) step.delayMs = s.delayMs;
    if (s.usage) step.usage = s.usage;
  }
  return step;
}

/** The pieces `text` streams in: word by word (each keeps its trailing space), or `chunks` even pieces. */
export function chunksOf(content: string, chunks?: number): string[] {
  if (!chunks || chunks < 1) return content.split(/(?<= )/).filter(Boolean);
  const size = Math.ceil(content.length / chunks);
  const out: string[] = [];
  for (let i = 0; i < content.length; i += size) out.push(content.slice(i, i + size));
  return out;
}
