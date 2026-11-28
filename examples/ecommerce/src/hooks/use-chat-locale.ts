import type { ChatMessages } from "@webmcp-agents/chat";
import { ar } from "@webmcp-agents/chat/locales/ar";
import { useSyncExternalStore } from "react";
import { type ChatLocale, chatLocaleSnapshot, subscribeChatLocale } from "../store/chat-locale";

export interface ChatLocaleState {
  locale: ChatLocale;
  /** The words for `<AgentChat messages>`: Arabic's catalog, or none (the built-in English). */
  messages: ChatMessages | undefined;
  /**
   * Where the chat docks. The devtools sit bottom-right in development, so the chat takes the left; the position is read
   * in the chat's own direction, so right-to-left needs the other value for the same physical side.
   */
  position: "bottom-left" | "bottom-right";
  /** The footer toggle's text, in the language it switches to. */
  toggleLabel: string;
  /** The footer toggle's accessible name. */
  toggleName: string;
  toggle(): void;
}

/** The assistant's language (src/store/chat-locale.ts), with what `<AgentChat>` and the footer toggle need for it. */
export function useChatLocale(): ChatLocaleState {
  const { locale, setLocale } = useSyncExternalStore(subscribeChatLocale, chatLocaleSnapshot, chatLocaleSnapshot);
  const arabic = locale === "ar";

  return {
    locale,
    messages: arabic ? ar : undefined,
    position: import.meta.env.DEV && !arabic ? "bottom-left" : "bottom-right",
    toggleLabel: arabic ? "English" : "العربية",
    toggleName: arabic ? "Switch the assistant to English" : "Switch the assistant to Arabic",
    toggle: () => setLocale(arabic ? "en" : "ar"),
  };
}
