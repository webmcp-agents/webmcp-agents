/**
 * The layer's console output: each fault is logged once per observability instance (a hundred requests with the same
 * bad exporter print one line), every thrown value through the redactor (a provider error can echo an API key).
 */
import { getRedactor } from "@webmcp-agents/core/redact";

/** A logger that prints each key once. */
export interface Log {
  /** An `error` line for `key`, once. `err` is printed redacted, message only. */
  error(key: string, message: string, err?: unknown): void;
  /** An `info` line for `key`, once. */
  info(key: string, message: string): void;
}

const PREFIX = "[web-agents/telemetry]";

/** A fresh logger (one per `defineObservability()`). */
export function createLog(): Log {
  const seen = new Set<string>();
  const first = (key: string): boolean => !seen.has(key) && !!seen.add(key);
  return {
    error(key, message, err) {
      if (!first(key)) return;
      let detail = "";
      if (err !== undefined) {
        try {
          detail = `: ${getRedactor().error(err)}`;
        } catch {
          detail = "";
        }
      }
      console.error(`${PREFIX} ${message}${detail}`);
    },
    info(key, message) {
      if (first(key)) console.info(`${PREFIX} ${message}`);
    },
  };
}
