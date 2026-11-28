/**
 * The chat's customization, threaded through every built-in part: the translate function, the classes and styles a
 * page gave each part, its replacement components, and whether the library's own classes are on (`unstyled`).
 */
import { createContext, type CSSProperties, type ReactNode, useContext } from "react";
import { en } from "./en";
import { createTranslator } from "./translate";
import type { ChatComponents, ChatMessages, ChatPart, PartProps, Translate } from "./types";

/** What every built-in part reads. */
export interface ChatContextValue {
  t: Translate;
  messages: ChatMessages;
  locale: string;
  dir: "ltr" | "rtl";
  classNames: Partial<Record<ChatPart, string>>;
  styles: Partial<Record<ChatPart, CSSProperties>>;
  components: Partial<ChatComponents>;
  unstyled: boolean;
}

const fallback: ChatContextValue = {
  t: createTranslator({}, "en"),
  messages: en,
  locale: "en",
  dir: "ltr",
  classNames: {},
  styles: {},
  components: {},
  unstyled: false,
};

const ChatContext = createContext<ChatContextValue>(fallback);

/** Provide a chat's customization to its parts. */
export function ChatProvider({ value, children }: { value: ChatContextValue; children: ReactNode }) {
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** The chat's customization (English and no overrides outside a chat). */
export const useChatContext = (): ChatContextValue => useContext(ChatContext);

/**
 * The props that make an element part `part`: `data-wa-part`, the built-in class (`builtIn`, left out when
 * `unstyled`) plus the page's class for that part, and the page's style for it (merged over `style`).
 */
export function partAttrs(ctx: ChatContextValue, part: ChatPart, builtIn?: string, style?: CSSProperties): PartProps["partProps"] {
  const className = [ctx.unstyled ? undefined : builtIn, ctx.classNames[part]].filter(Boolean).join(" ") || undefined;
  const own = ctx.styles[part];
  return {
    "data-wa-part": part,
    ...(className && { className }),
    ...((style || own) && { style: { ...style, ...own } }),
  };
}

/**
 * Visually hidden, still read: what `.wa-chat__sr` does, inline, for `unstyled` chats (they load no stylesheet, and a
 * screen-reader-only label must never show up as visible text).
 */
export const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

/** `partAttrs` bound to the current chat. */
export function usePart(): (part: ChatPart, builtIn?: string, style?: CSSProperties) => PartProps["partProps"] {
  const ctx = useChatContext();
  return (part, builtIn, style) => partAttrs(ctx, part, builtIn, style);
}

/** The base props of a replacement component for `part`. */
export function slotProps(ctx: ChatContextValue, part: ChatPart, builtIn?: string, children?: ReactNode): PartProps {
  return { partProps: partAttrs(ctx, part, builtIn), messages: ctx.messages, t: ctx.t, ...(children !== undefined && { children }) };
}
