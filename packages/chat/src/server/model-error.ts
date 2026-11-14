/**
 * Turns a model call's failure into words for the page and one line for the server log.
 *
 * Without this every provider failure reached the chat as "had a problem answering": a revoked key, an empty account
 * and a provider outage looked the same, and the cause sat in a stack trace in the server terminal.
 */
import { APICallError, RetryError } from "ai";

/** What went wrong with the model call, as the chat shows it. */
export interface ModelErrorDescription {
  /** Shown in the chat. Says what happened; in development it ends with the provider's own message. */
  message: string;
  /** One line for the server log: the status and the provider's message. */
  log: string;
}

const GENERIC = "The assistant had a problem answering. Try again.";

// OpenAI: 429 insufficient_quota; Anthropic: 400 "credit balance is too low"; others: 402.
const OUT_OF_CREDITS = /insufficient_quota|credit balance|no credits|out of credits|billing|quota exceeded|exceeded your current quota/i;

/** The provider error behind AI SDK's retry wrapper, if there is one. */
function unwrap(err: unknown): unknown {
  if (RetryError.isInstance(err)) return err.lastError ?? err;
  return err;
}

function providerMessage(err: APICallError): string {
  return (err.message || err.responseBody || "").trim().slice(0, 300);
}

function category(err: APICallError, text: string): string {
  const status = err.statusCode ?? 0;
  if (status === 402 || OUT_OF_CREDITS.test(text))
    return "The AI provider account is out of credits, so the assistant can't answer right now.";
  if (status === 401 || status === 403) return "The AI provider rejected the server's API key, so the assistant can't answer right now.";
  if (status === 404) return "The AI provider doesn't offer the model this server is set to use.";
  if (status === 429) return "The AI provider is rate-limiting requests. Try again in a moment.";
  if (status >= 500) return "The AI provider is having trouble right now. Try again in a moment.";
  return GENERIC;
}

/**
 * Describes a failed model call. `dev` (default: NODE_ENV is not "production") adds the provider's message to the
 * chat's text, so a misconfigured server says why in the page; production keeps it to the category.
 */
export function describeModelError(err: unknown, dev = isDev()): ModelErrorDescription {
  const cause = unwrap(err);
  if (!APICallError.isInstance(cause)) {
    const text = cause instanceof Error ? cause.message : String(cause);
    return { message: dev && text ? `${GENERIC} (${text})` : GENERIC, log: text };
  }
  const text = providerMessage(cause);
  const message = category(cause, text);
  const status = cause.statusCode ? `${cause.statusCode} ` : "";
  return {
    message: dev && text ? `${message} (${status}${text})` : message,
    log: `${status}${cause.url ? `from ${cause.url}: ` : ""}${text}`,
  };
}

function isDev(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}
