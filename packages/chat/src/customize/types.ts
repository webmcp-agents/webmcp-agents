/**
 * The public shapes of chat customization: the parts, the theme, the message catalog and the replaceable components.
 * Plain data where it can be (a theme and a catalog are valid JSON), so a page can load them from a CMS.
 */
import type { ComponentType, CSSProperties, ReactNode, RefObject } from "react";
import type { WebAgentStep } from "../agent";
import type { AdapterStatus, AgentMessage, AgentPart, ModelChoice } from "../types";
import type { CHAT_PARTS } from "./parts";
import type { THEME_GROUPS } from "./tokens";

/**
 * Every element the chat renders. Also the value of its `data-wa-part` attribute, the key of `classNames` and
 * `styles`, and what a CSS selector targets: `[data-wa-part="toolCard"][data-state="awaiting-confirmation"]`.
 * The drawing inside an icon (`<path>`, `<rect>`) belongs to its `icon`. The list is `CHAT_PARTS`.
 */
export type ChatPart = (typeof CHAT_PARTS)[number];

type Group<K extends readonly string[]> = Partial<Record<K[number], string>>;

/**
 * A serializable theme: every key maps to one `--wa-chat-*` variable (`color.accentInk` → `--wa-chat-color-accent-ink`).
 * Any CSS value works (`"oklch(0.62 0.19 255)"`, `"var(--brand)"`, `"clamp(…)"`). Keys that are not tokens are
 * ignored, and a value holding `;`, `{` or `}` is dropped, so JSON from a CMS can never write an invalid property.
 */
export interface ChatTheme {
  /** Colors. `accent` is the launcher, the send button and the person's bubble. Default: the 0.4.0 palette. */
  color?: Group<(typeof THEME_GROUPS)["color"]>;
  /** Type. `size` is the body text (14px), `sizeInput` the composer (16px: no zoom on iOS). */
  font?: Group<(typeof THEME_GROUPS)["font"]>;
  /** Corner radii. `bubble`, `card` and `control` follow `panel` (2, 4 and 6 px less) unless set. */
  radius?: Group<(typeof THEME_GROUPS)["radius"]>;
  /**
   * Spacing: `gap` (the floating chat's distance from the edges), `pad` (the panel's padding), `padBubble`, a scale
   * `xxs`…`xxl` (2–14 px), `insetBottom`. `insetLeft` / `insetRight` are written by the chat on `<html>` while it
   * docks (the room the page makes): read them to keep your own fixed UI clear.
   */
  space?: Group<(typeof THEME_GROUPS)["space"]>;
  /** Sizes: the floating panel (`width`, `maxHeight`), the docked panel's first width (`dockWidth`), controls, borders. */
  size?: Group<(typeof THEME_GROUPS)["size"]>;
  /** Shadows of the panel, the launcher, the floating "jump" button (`card`), the chosen switch and the restore chip. */
  shadow?: Group<(typeof THEME_GROUPS)["shadow"]>;
  /** Easing, durations and the distances things move. Reduced motion turns movement off whatever these say. */
  motion?: Group<(typeof THEME_GROUPS)["motion"]>;
  /** The chat's stacking order. Default: just under the agent cursor (`calc(var(--agent-z) - 2)`). */
  z?: string;
  /** The resize handle's stacking order inside the panel. Default 1. */
  zHandle?: string;
}

/** One theme, or one per color scheme (applied with `prefers-color-scheme`, or forced by `colorScheme`). */
export type ChatThemeInput = ChatTheme | { light?: ChatTheme; dark?: ChatTheme };

/**
 * A string, or a function of its values (for word order and plurals a template cannot express). A string may hold
 * `{name}` placeholders and ICU-style plurals: `"{count, plural, one {# step} other {# steps}}"`.
 */
export type Message<V = never> = [V] extends [never] ? string : string | ((values: V) => string);

/** Every failure the chat can explain, by code. `unknown` is the fallback for anything else. */
export type ChatErrorCode =
  | "chat_disabled"
  | "rate_limited"
  | "daily_limit"
  | "bad_request"
  | "network"
  | "session"
  | "busy"
  | "max_steps"
  | "aborted"
  | "run_failed"
  | "unknown";

/**
 * Every user-visible string, `aria-label`, `placeholder`, `title` and screen-reader announcement of the chat. No
 * string exists outside this object. The English defaults are `en`; a page overrides any part (`ChatMessagesInput`).
 */
export interface ChatMessages {
  /** The panel's heading. Default "Assistant". The `title` prop, when given, wins. */
  title: string;
  /** The launcher's accessible name. Default "Open {title}" / "Close {title}", the title in lower case. */
  launcher: { open: Message<{ title: string }>; close: Message<{ title: string }> };
  /** The header's icon buttons. */
  header: { close: string; newChat: string };
  /** The message box. `label` is its accessible name, `placeholder` the hint inside it. */
  composer: { placeholder: string; send: string; stop: string; label: string };
  /** The empty conversation: an optional heading (`title`, empty by default: not shown) and the paragraph. */
  empty: { title: string; hint: string };
  /**
   * The adapter switcher: its group name (`label`) and the names of built-in adapters (`cloud` before the endpoint
   * reports its model, `cloudNamed` after; `onDevice`). `unavailable` is the tooltip of an adapter that cannot run.
   */
  adapter: { label: string; cloud: string; cloudNamed: Message<{ model: string }>; onDevice: string; unavailable: string };
  /**
   * The model picker: its `label`, an option's suffixes (`recommended`, `cached`, applied to `{model}`), and the line
   * under it (`sizeCached`, `sizeDownload`, `onDevice`). `size` formats a byte count (`formatted` is already
   * localized, e.g. "1.4 GB"); `pick` names the select when there is no visible label.
   */
  model: {
    label: string;
    pick: string;
    recommended: Message<{ model: string }>;
    cached: Message<{ model: string }>;
    onDevice: string;
    sizeCached: Message<{ size: string }>;
    sizeDownload: Message<{ size: string }>;
    size: Message<{ bytes: number; formatted: string }>;
  };
  /**
   * The on-device model: the offer, the download and the load. `percent` is 0–100, `formatted` the localized percent
   * ("42%"); `size`, `done`, `total` are localized byte counts.
   */
  download: {
    offer: string;
    size: Message<{ size: string }>;
    sizeUnknown: string;
    privacy: string;
    start: string;
    useOther: Message<{ adapter: string }>;
    otherFallback: string;
    title: string;
    loadingTitle: string;
    starting: string;
    firstStart: string;
    alreadyHere: string;
    downloading: Message<{ percent: number; formatted: string }>;
    loading: Message<{ percent: number; formatted: string }>;
    progress: Message<{ percent: number; formatted: string }>;
    progressBytes: Message<{ percent: number; formatted: string; done: string; total: string }>;
    label: string;
    loadingLabel: string;
    cancel: string;
    failed: string;
    loadFailed: string;
    retry: string;
    ready: string;
  };
  /**
   * A tool call's card: its state chip (each a function of `{tool}`, the tool's readable name), the prompt while it
   * waits for the person, the "Show me" link, a sub-agent's name (`agent`), and labels for custom cards.
   */
  tool: {
    running: Message<{ tool: string }>;
    awaitingConfirmation: Message<{ tool: string }>;
    done: Message<{ tool: string }>;
    failed: Message<{ tool: string }>;
    cancelled: Message<{ tool: string }>;
    confirmOnPage: string;
    showOnPage: string;
    agent: Message<{ agent: string }>;
    input: string;
    output: string;
    showDetails: string;
    hideDetails: string;
  };
  /** A sub-agent's run, for custom cards (the built-in card names the agent with `tool.agent`). */
  subagent: { working: Message<{ agent: string }>; finished: Message<{ agent: string }> };
  /** The model's reasoning, for a custom `Reasoning` part (the built-in chat does not show reasoning). */
  reasoning: { thinking: string; show: string; hide: string };
  /** A step count, for custom parts: `"{count, plural, one {# step} other {# steps}}"`. */
  steps: Message<{ count: number }>;
  /** Keyed by error code (adapter, session and server). `unknown` is the fallback. */
  errors: Record<ChatErrorCode, string>;
  /** The error's button: run the interrupted turn again. */
  retry: string;
  /**
   * Screen-reader announcements (a visually hidden live region). `waitingForYou` is read when a tool parks on the
   * page for the person's click; the others are for custom announcers.
   */
  live: {
    thinking: string;
    answered: string;
    toolStarted: Message<{ tool: string }>;
    waitingForYou: Message<{ tool: string }>;
  };
  /** The message list: its accessible name, the "working" indicator, and the button back to the newest message. */
  conversation: { label: string; working: string; jumpToLatest: string };
  /** The line above the composer while the adapter gets ready (`notReady`: the registry block's catch-all). */
  status: { connecting: string; needsDownload: string; notReady: string };
  /**
   * The registry blocks' trace lines (`@webmcp-agents` shadcn registry): a tool call (`{tool}`, its name in words),
   * a call parked on the page, a sub-agent's run (`{agent}`), and reasoning once it is done (`thought`).
   */
  trace: {
    running: Message<{ tool: string }>;
    waiting: Message<{ tool: string }>;
    done: Message<{ tool: string }>;
    doneNote: string;
    cancelled: Message<{ tool: string }>;
    failed: Message<{ tool: string }>;
    confirmTitle: string;
    confirmFallback: Message<{ tool: string }>;
    agentRunning: Message<{ agent: string }>;
    agentDone: Message<{ agent: string }>;
    agentCancelled: Message<{ agent: string }>;
    agentFailed: Message<{ agent: string }>;
    agentBadge: string;
    thought: string;
  };
  /** The suggestions row: its accessible name and the one built-in suggestion. */
  suggestions: { label: string; fallback: string };
  /** The docked panel's resize handle. */
  resize: string;
  /**
   * Restore (0.4.0): the per-message button (`button`, with `{message}`, the message cut to 42 characters, or
   * `untitled`), its tooltip (`hint`), the confirm step (`confirm`, `confirmQuestion` naming the pair, `cancel`) and
   * the note after it (`done`).
   */
  restore: {
    button: Message<{ message: string }>;
    hint: string;
    untitled: string;
    confirm: string;
    confirmQuestion: string;
    cancel: string;
    done: string;
  };
}

/** A partial at any depth: what `messages` takes. */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> | null }
    : T;

/**
 * A partial override of the catalog, at any depth. Plain JSON is valid: `{name}` placeholders and plurals are
 * interpolated. A key left out, or set to `null`, shows the English default.
 */
export type ChatMessagesInput = DeepPartial<ChatMessages>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | ((values: never) => string)
    ? `${P}${K}`
    : T[K] extends object
      ? Leaves<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

/** A catalog entry by its path: `"composer.send"`, `"errors.network"`, `"tool.running"`. */
export type MessageKey = Leaves<ChatMessages>;

/** Values a message is filled with. Numbers are formatted for the locale. */
export type MessageValues = Record<string, string | number | boolean | undefined>;

/** Locale-aware formatting, the same the chat uses. */
export interface ChatFormat {
  /** A number, grouped for the locale: `1234` → "1,234". */
  number(value: number): string;
  /** A fraction as a percent, rounded: `0.42` → "42%". */
  percent(fraction: number): string;
  /** A byte count, in MB under a gigabyte, else GB with one decimal: "380 MB", "1.4 GB". */
  bytes(bytes: number): string;
}

/**
 * Look up a message by key and fill it. Never returns `undefined` or the key: a missing entry is the English default,
 * an unknown key is `""`, and a message function that throws falls back to English.
 */
export type Translate = ((key: MessageKey, values?: MessageValues) => string) & {
  /** The locale actually used (an invalid tag falls back to "en"). */
  readonly locale: string;
  /** The merged catalog (English under the overrides). */
  readonly messages: ChatMessages;
  /** Formatting for that locale. */
  readonly format: ChatFormat;
};

/** The names of the chat's built-in icons. */
export type IconName = "chat" | "close" | "send" | "stop" | "reset" | "down" | "restore" | "check" | "cancel";

/** Props every replaceable part receives. Spread `partProps` on your root element to keep the hooks and a11y. */
export interface PartProps {
  /** `data-wa-part`, the part's classes (the built-in ones and yours) and its `styles` entry. */
  partProps: { "data-wa-part": ChatPart; className?: string; style?: CSSProperties };
  /** The merged catalog. */
  messages: ChatMessages;
  /** The translate function for this chat's catalog and locale. */
  t: Translate;
  /** What the built-in part would render inside itself, when it has content: wrap it or leave it out. */
  children?: ReactNode;
}

/** The parts an app can replace with its own component (`components={{ ToolCard }}`). */
export interface ChatComponents {
  /** The round button that opens and closes the panel. */
  Launcher: ComponentType<PartProps & { open: boolean; toggle(): void; busy: boolean }>;
  /** The panel's header: the title, New chat (`canReset`) and Close. */
  Header: ComponentType<PartProps & { title: string; titleId: string; close(): void; reset(): void; canReset: boolean }>;
  /** One message of the conversation; `children` are its rendered parts. */
  Message: ComponentType<PartProps & { message: AgentMessage }>;
  /** Plain text (model or person): paragraphs, never HTML. */
  Text: ComponentType<PartProps & { text: string; streaming: boolean }>;
  /** A tool call. `call` is redacted (sensitive fields masked); `part` is the raw part; `children` the nested run. */
  ToolCard: ComponentType<PartProps & { call: WebAgentStep; part: Extract<AgentPart, { type: "tool" }> }>;
  /** The model's reasoning. Not shown unless you pass one. */
  Reasoning: ComponentType<PartProps & { text: string }>;
  /** Starter prompts for an empty conversation. */
  Suggestions: ComponentType<PartProps & { items: readonly string[]; pick(text: string): void }>;
  /** The message box. `unavailable` says why it is disabled (the adapter is not ready), or is `null`. */
  Composer: ComponentType<
    PartProps & {
      value: string;
      setValue(v: string): void;
      send(): void;
      stop(): void;
      busy: boolean;
      unavailable: string | null;
      inputRef: RefObject<HTMLTextAreaElement | null>;
    }
  >;
  /** The on-device model's offer, download progress, load, or failure. */
  DownloadCard: ComponentType<
    PartProps & {
      status: Extract<AdapterStatus, { state: "needs-download" | "downloading" | "loading" | "error" }>;
      bytes?: number;
      start(): void;
      cancel(): void;
      useOther?: () => void;
      otherLabel?: string;
    }
  >;
  /** Which model the adapter runs, when it offers several. */
  ModelPicker: ComponentType<PartProps & { models: readonly ModelChoice[]; select(id: string): void; disabled: boolean }>;
  /** The empty conversation; `children` are the suggestions and the download card. */
  Empty: ComponentType<PartProps>;
  /** The last run's failure, by code; `retry` is absent when retrying cannot help (chat not configured). */
  Error: ComponentType<PartProps & { code: ChatErrorCode; retry?(): void }>;
  /** An icon, hidden from assistive tech (its button is named). */
  Icon: ComponentType<{ name: IconName; size?: number }>;
  /** The restore control of one user message (0.4.0): idle, or asking to confirm. */
  Restore: ComponentType<PartProps & { message: AgentMessage; confirming: boolean; ask(): void; confirm(): void; cancel(): void }>;
}

/** What `<AgentChat>` takes to look and read the way a page wants. Every key is optional. */
export interface ChatCustomization {
  /** CSS variable values, as one theme or one per scheme. Applied on the chat's root, so nothing else on the page changes. */
  theme?: ChatThemeInput;
  /**
   * Force a scheme. Default "auto": `data-theme="dark"` on the chat or on any ancestor forces dark;
   * `data-theme="light"` on the chat's own root forces light (on an ancestor it does not: the OS decides);
   * otherwise the OS (`prefers-color-scheme`). "light" and "dark" set `data-theme` on the chat's own root.
   */
  colorScheme?: "auto" | "light" | "dark";
  /** Overrides of the message catalog (any depth, plain JSON or functions). Missing keys stay English. */
  messages?: ChatMessagesInput;
  /** BCP 47. Drives number, byte and percent formatting, plural rules and the direction. Default: `<html lang>`, else "en". */
  locale?: string;
  /** Text direction. Default: from `locale` (ar, he, fa, ur and their regions → "rtl"), else `<html dir>`, else "ltr". */
  dir?: "ltr" | "rtl";
  /** Extra classes per part, added to the built-in ones. */
  classNames?: Partial<Record<ChatPart, string>>;
  /** Inline styles per part. */
  styles?: Partial<Record<ChatPart, CSSProperties>>;
  /** Your own components in place of built-in parts. */
  components?: Partial<ChatComponents>;
  /**
   * Render with no library styling: no `wa-chat*` classes and no theme variables, only `data-wa-part` hooks, your
   * `classNames` and `styles`, and every role, label and key binding. Do not import `chat.css`. Default false.
   */
  unstyled?: boolean;
}
