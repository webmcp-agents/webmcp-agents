/**
 * The assistant's language: English or Arabic. One store for the page, outside React, so the footer's toggle and the
 * chat (src/root.tsx) read the same value through `useChatLocale()` (src/hooks/use-chat-locale.ts). Only the chat
 * changes language and direction; the shop's own pages stay as they are.
 */
export type ChatLocale = "en" | "ar";

export interface ChatLocaleApi {
  locale: ChatLocale;
  setLocale(locale: ChatLocale): void;
}

let locale: ChatLocale = "en";
const listeners = new Set<() => void>();

function setLocale(next: ChatLocale): void {
  if (locale === next) return;
  locale = next;
  view = { ...chatLocale, locale };
  for (const listener of listeners) listener();
}

/** The assistant's language: `chatLocale.locale` is the state now. */
export const chatLocale: ChatLocaleApi = {
  get locale() {
    return locale;
  },
  setLocale,
};

let view: ChatLocaleApi = { ...chatLocale, locale };

/** Calls `listener` when the language changes; returns the unsubscribe. */
export function subscribeChatLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The language as a render sees it: the same object until it changes. */
export const chatLocaleSnapshot = (): ChatLocaleApi => view;
