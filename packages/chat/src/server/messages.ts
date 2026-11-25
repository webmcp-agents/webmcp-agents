/**
 * The text the handler writes for the model and for callers that are not the chat UI: the note that ends a turn's
 * tool budget, a call to a tool that is not on the page, and the body of a 500. The chat UI never shows these (it
 * words failures from the catalog, by code); an app localizes them with `createChatHandler({ messages })`.
 */
import { notOnPage } from "../shared";

/** Text the handler writes for the model or a non-UI client. Every key is optional; English is the default. */
export interface ChatServerMessages {
  /** Told to the model when the turn's tool budget (`maxSteps`) is spent: it answers without tools. */
  toolBudget?: string;
  /**
   * The result of a call to a tool that is not on the page (`{tool}` is its name, or use a function). Keep the
   * leading `Error [unavailable]:` code: the system prompt tells the model what each code means.
   */
  notOnPage?: string | ((values: { tool: string }) => string);
  /** The `message` of a 500 (`{ error: "server_error" }`) for a request that failed on the server. */
  serverError?: string;
}

/** The English defaults (what 0.4.0 wrote). */
export const SERVER_MESSAGES = {
  toolBudget: "Tool budget for this request reached: summarize what was done and what is left, without calling tools.",
  notOnPage: ({ tool }: { tool: string }): string => notOnPage(tool),
  serverError: "The assistant had a problem answering. Try again.",
} as const;

/**
 * The handler's texts: each given string or function, else the English default. A function that throws or returns
 * something other than a string falls back to English, so the model always gets an answer.
 */
export function serverMessages(input: ChatServerMessages = {}): {
  toolBudget: string;
  notOnPage(tool: string): string;
  serverError: string;
} {
  const text = (value: unknown, fallback: string): string => (typeof value === "string" && value.trim() ? value : fallback);
  return {
    toolBudget: text(input.toolBudget, SERVER_MESSAGES.toolBudget),
    notOnPage(tool) {
      const custom = input.notOnPage;
      if (typeof custom === "function") {
        try {
          return text(custom({ tool }), SERVER_MESSAGES.notOnPage({ tool }));
        } catch {
          return SERVER_MESSAGES.notOnPage({ tool });
        }
      }
      return typeof custom === "string" && custom.trim() ? custom.replace(/\{tool\}/g, tool) : SERVER_MESSAGES.notOnPage({ tool });
    },
    serverError: text(input.serverError, SERVER_MESSAGES.serverError),
  };
}
