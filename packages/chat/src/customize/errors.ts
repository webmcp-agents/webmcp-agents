/**
 * Error codes: what the chat shows is chosen by code, never by the text a server or adapter sent, so a page in any
 * language explains every failure, and a 0.4.0 server (which sends fewer codes) still gets translated text.
 */
import type { ChatErrorCode } from "./types";

/** Every code the catalog has a message for (`ChatMessages["errors"]`). */
export const CHAT_ERROR_CODES: readonly ChatErrorCode[] = [
  "chat_disabled",
  "rate_limited",
  "daily_limit",
  "bad_request",
  "network",
  "session",
  "busy",
  "max_steps",
  "aborted",
  "run_failed",
  "unknown",
];

/**
 * Codes only the endpoint sends, and what the person reads for each: they are not catalog keys. A refused origin or a
 * server failure means nothing the person can act on (`unknown`); an endpoint that is down for now is `busy`.
 */
const SERVER_ONLY: Record<string, ChatErrorCode> = {
  forbidden: "unknown",
  method_not_allowed: "unknown",
  server_error: "unknown",
  forbidden_origin: "unknown",
  unavailable: "busy",
  session_required: "session",
};

/**
 * The catalog code for a failure's code: one of ours as is, a server-only code mapped to what the person can act on,
 * and anything else (missing, unknown, not a string) `unknown`.
 *
 * @example
 * chatErrorCode("rate_limited"); // "rate_limited"
 * chatErrorCode("forbidden_origin"); // "unknown"
 * chatErrorCode(undefined); // "unknown"
 */
export function chatErrorCode(code: unknown): ChatErrorCode {
  if (typeof code !== "string") return "unknown";
  if ((CHAT_ERROR_CODES as readonly string[]).includes(code)) return code as ChatErrorCode;
  return SERVER_ONLY[code] ?? "unknown";
}
