/**
 * <AgentChat>: a launcher and a non-modal chat panel. The agent works the page
 * through its WebMCP tools while the person watches, so by default the panel
 * docks beside the page (which makes room for it) rather than covering it, and
 * the person can drag it wider or narrower. `layout="floating"` keeps the
 * corner pop-over instead.
 *
 * The panel lives in a body-level host carrying `data-web-agents-ui`, so typing
 * here never counts as "the user took over" for the agent cursor.
 */
import { UI_HOST_ATTR } from "@webmcp-agents/core";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import type { WebAgent } from "../agent";
import { useAgentChat } from "../session/use-agent-chat";
import type { ChatRestoreSnapshots } from "../session/restore-snapshot";
import type { AgentAdapter } from "../types";
import { Composer } from "./Composer";
import { ResizeHandle, useDock } from "./dock";
import { DownloadCard } from "./DownloadCard";
import { type ChatContextValue, ChatProvider, partAttrs, SR_ONLY, slotProps } from "../customize/context";
import { chatErrorCode } from "../customize/errors";
import { isSchemedTheme, schemedThemeCss, themeToCssVars } from "../customize/theme";
import { directionOf, safeLocale } from "../customize/translate";
import type { ChatCustomization, ChatTheme } from "../customize/types";
import { AdapterSwitcher, adapterLabel, unavailableReason } from "./AdapterSwitcher";
import { Icon } from "./icons";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
import { Suggestions } from "./Suggestions";

/** Props of `<AgentChat>`: what it runs, where it sits, and how it looks and reads (`ChatCustomization`). */
export interface AgentChatProps extends ChatRestoreSnapshots, ChatCustomization {
  /** What runs the model. Default: one shared `createCloudAdapter()` (your `/api/chat`), when `adapters` is not given either. */
  adapter?: AgentAdapter;
  /** Several agents: the panel shows a switcher (cloud, in-browser…). The first is the default. */
  adapters?: readonly AgentAdapter[];
  /**
   * The agent for this page (`defineWebAgent`): its instructions, the tools it may use and its sub-agents. Register
   * the same definition on the server (`createChatHandler({ agents })`). Default: every page tool, no instructions.
   */
  agent?: WebAgent;
  /** Panel title. Default: the catalog's `title` ("Assistant"). Wins over `messages.title`. */
  title?: string;
  /** Open on first render. Default false. */
  defaultOpen?: boolean;
  /** Side (and corner) for the launcher and panel. Default "bottom-right". */
  position?: "bottom-right" | "bottom-left";
  /**
   * "docked" (default): beside the page, full height, resizable; the page makes room. "floating": a pop-over in the
   * corner. Narrow screens get a bottom sheet either way.
   */
  layout?: "docked" | "floating";
  /** Starter prompts for an empty conversation; default: derived from the page's tools. `false` hides them. */
  suggestions?: string[] | false;
  /** Extra class on the host element (theme with the `--wa-chat-*` properties). Same as `classNames.root`. */
  className?: string;
  /**
   * sessionStorage key for the conversation; `false` keeps it in memory. Default "web-agents:chat". Whether the panel
   * is open is kept next to it (`<key>:open`), so a page load (a navigation the agent made without the app's router,
   * a reload) brings the chat back as it was.
   */
  storageKey?: string | false;
}

/**
 * The panel's open state, kept in sessionStorage under `key`. Read after the first render (the server's HTML and the
 * first render match) but before the first paint (a layout effect), so a panel saved closed never flashes open or
 * docks the page; written only when it is changed, never by an effect (StrictMode runs effects twice in
 * development, and an effect would save the not-yet-restored state over the saved one).
 */
function useOpen(defaultOpen: boolean, key: string | false): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(defaultOpen);
  useLayoutEffect(() => {
    if (!key) return;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) setOpen(saved === "1");
    } catch {
      // storage blocked: the chat starts as `defaultOpen`
    }
  }, [key]);
  const change = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!key) return;
      try {
        sessionStorage.setItem(key, next ? "1" : "0");
      } catch {
        // storage blocked or full: only the open state is lost
      }
    },
    [key],
  );
  return [open, change];
}

/** The page's language and direction (`<html lang>`, `<html dir>`), read in the browser. */
function pageLanguage(): { lang?: string; dir?: "ltr" | "rtl" } {
  if (typeof document === "undefined") return {};
  const html = document.documentElement;
  const dir = html.getAttribute("dir")?.toLowerCase();
  return { lang: html.lang || undefined, dir: dir === "rtl" || dir === "ltr" ? dir : undefined };
}

/** The body-level host the chat renders into (so it sits above the page, outside its layout). */
function useHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute(UI_HOST_ATTR, "chat");
    document.body.append(el);
    setHost(el);
    return () => el.remove();
  }, []);
  return host;
}

/** CSS properties whose numbers take no unit (React's list, cut to what a chat root plausibly sets). */
const UNITLESS = new Set(["opacity", "zIndex", "flex", "flexGrow", "flexShrink", "order", "fontWeight", "lineHeight", "zoom"]);

/** What the host carries: classes, hooks, direction, scheme and the theme's variables. */
interface HostAttributes {
  className: string;
  position: string;
  layout: string;
  dir: "ltr" | "rtl";
  lang: string;
  colorScheme: ChatCustomization["colorScheme"];
  themeId?: string;
  vars: Record<string, string>;
  style?: CSSProperties;
}

/**
 * Keep the host's attributes in sync, before paint (a layout effect), so the first frame already has the theme. Only
 * what this chat set is removed again: an app's own attributes on the host are left alone.
 */
function useHostAttributes(host: HTMLElement | null, attrs: HostAttributes): void {
  const applied = useRef<string[]>([]);
  const forced = useRef(false);
  const { className, position, layout, dir, lang, colorScheme, themeId, vars, style } = attrs;
  useLayoutEffect(() => {
    if (!host) return;
    host.className = className;
    if (!host.className) host.removeAttribute("class");
    host.setAttribute("data-wa-part", "root");
    host.dataset.position = position;
    host.dataset.layout = layout;
    host.dir = dir;
    host.lang = lang;
    // "auto" leaves `data-theme` to the page (0.4.0); only a value this chat set is taken back
    if (colorScheme === "light" || colorScheme === "dark") {
      host.dataset.theme = colorScheme;
      forced.current = true;
    } else if (forced.current) {
      delete host.dataset.theme;
      forced.current = false;
    }
    if (themeId) host.dataset.waTheme = themeId;
    else delete host.dataset.waTheme;
    // inline: the theme's variables, then the page's `styles.root`
    for (const name of applied.current) host.style.removeProperty(name);
    const set: string[] = [];
    for (const [name, value] of Object.entries(vars)) {
      host.style.setProperty(name, value);
      set.push(name);
    }
    for (const [key, value] of Object.entries(style ?? {})) {
      if (value === undefined || value === null) continue;
      const name = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      host.style.setProperty(name, typeof value === "number" && !UNITLESS.has(key) && !key.startsWith("--") ? `${value}px` : String(value));
      set.push(name);
    }
    applied.current = set;
  }, [host, className, position, layout, dir, lang, colorScheme, themeId, vars, style]);
}

/** The chat launcher and panel. Render it inside `<WebAgentsProvider>` so the agent sees the tools the page has on. */
export function AgentChat({
  adapter,
  adapters,
  agent,
  title: titleProp,
  defaultOpen = false,
  position = "bottom-right",
  layout = "docked",
  suggestions,
  className,
  storageKey,
  getSnapshot,
  applySnapshot,
  theme,
  colorScheme,
  messages,
  locale: localeProp,
  dir: dirProp,
  classNames,
  styles,
  components,
  unstyled = false,
}: AgentChatProps) {
  // ---------- 1. language and direction: the props, else the page's ----------
  const [page, setPage] = useState<{ lang?: string; dir?: "ltr" | "rtl" }>({});
  useLayoutEffect(() => setPage(pageLanguage()), []);
  const locale = safeLocale(localeProp ?? page.lang);
  const dir = dirProp ?? (localeProp ? directionOf(locale) : (page.dir ?? (page.lang ? directionOf(locale) : "ltr")));

  // one state source, shared with custom UIs: the adapter choice, the session, the adapter's status and models
  const chat = useAgentChat({ adapter, adapters, agent, storageKey, getSnapshot, applySnapshot, messages, locale });
  const { adapters: all, adapter: current, selectAdapter: choose, session, t } = chat;
  const title = titleProp ?? t("title");

  // ---------- 2. the context every part reads ----------
  const ctx = useMemo<ChatContextValue>(
    () => ({
      t,
      messages: t.messages,
      locale: t.locale,
      dir,
      classNames: classNames ?? {},
      styles: styles ?? {},
      components: components ?? {},
      unstyled,
    }),
    [t, dir, classNames, styles, components, unstyled],
  );
  const part = (name: Parameters<typeof partAttrs>[1], builtIn?: string, style?: CSSProperties) => partAttrs(ctx, name, builtIn, style);

  // ---------- 3. the host: classes, hooks, theme ----------
  const host = useHost();
  const themeKey = useId().replace(/[^\w-]/g, "");
  const schemed = !unstyled && theme ? isSchemedTheme(theme) : false;
  const themeCss = useMemo(
    () =>
      schemed && theme ? schemedThemeCss(theme as { light?: ChatTheme; dark?: ChatTheme }, `.wa-chat[data-wa-theme="${themeKey}"]`) : "",
    [schemed, theme, themeKey],
  );
  const vars = useMemo(() => (!unstyled && theme && !schemed ? themeToCssVars(theme as ChatTheme) : {}), [unstyled, theme, schemed]);
  // the physical side the dock takes: `position` read in the chat's own direction
  const side = (position === "bottom-left") === (dir === "rtl") ? "right" : "left";
  useHostAttributes(host, {
    className: [unstyled ? undefined : "wa-chat", className, classNames?.root].filter(Boolean).join(" "),
    position,
    layout,
    dir,
    lang: t.locale,
    colorScheme,
    themeId: themeCss ? themeKey : undefined,
    vars,
    style: styles?.root,
  });

  const [open, setOpen] = useOpen(defaultOpen, storageKey === false ? false : `${storageKey ?? "web-agents:chat"}:open`);
  const dock = useDock(open && layout === "docked", side, host);
  const panelId = useId();
  const titleId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [restoredNote, setRestoredNote] = useState(false);
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoring = useRef(false);

  // Opening puts the cursor in the composer.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(
    () => () => {
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
    },
    [],
  );

  function clearRestoredNote() {
    if (restoredTimer.current) clearTimeout(restoredTimer.current);
    restoredTimer.current = null;
    setRestoredNote(false);
  }

  function showRestoredNote() {
    clearRestoredNote();
    setRestoredNote(true);
    restoredTimer.current = setTimeout(() => {
      restoredTimer.current = null;
      setRestoredNote(false);
    }, 4000);
  }

  async function restore(messageId: string) {
    restoring.current = true;
    let result: Awaited<ReturnType<typeof session.restore>>;
    try {
      result = await session.restore(messageId);
    } finally {
      restoring.current = false;
    }
    if (!result) return;
    // keep a half-written message: the restored text goes first, the draft after it
    setDraft((current) => (current.trim() ? `${result.restoredText}\n\n${current}` : result.restoredText));
    showRestoredNote();
    inputRef.current?.focus();
  }

  /** `false` while a restore is under way: the session won't send, so the composer keeps the text (merged after). */
  function send(text: string): boolean {
    if (restoring.current) return false;
    clearRestoredNote();
    session.send(text);
    return true;
  }

  function reset() {
    clearRestoredNote();
    session.reset();
  }

  function close() {
    // commit first: the launcher is hidden while the panel is open, and a hidden button can't take focus
    flushSync(() => setOpen(false));
    launcherRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }

  // ---------- 4. the adapter's state, worded ----------
  const status = session.adapterStatus;
  const percent = (progress: number) => ({ percent: Math.round(progress * 100), formatted: t.format.percent(progress) });
  const unavailable =
    status.state === "ready"
      ? null
      : status.state === "unavailable"
        ? unavailableReason(status, t)
        : status.state === "error"
          ? status.error || t("errors.unknown")
          : status.state === "loading"
            ? status.progress === undefined
              ? t("status.connecting")
              : t("download.loading", percent(status.progress))
            : status.state === "downloading"
              ? t("download.downloading", percent(status.progress))
              : t("status.needsDownload");

  // ---------- model download (opt-in, cancellable) ----------
  const download = useRef<AbortController | null>(null);
  const size = useRef<number | undefined>(undefined);
  if (status.state === "needs-download") size.current = status.bytes;
  const startDownload = (): void => {
    download.current?.abort();
    const ctrl = new AbortController();
    download.current = ctrl;
    chat.prepare?.(ctrl.signal).catch(() => {}); // failures show as the adapter's "error" status
  };
  const other = all.find((a) => a.id !== current.id);
  // ---------- model picker (adapters that offer several models) ----------
  const models = chat.models;
  const streaming = session.status === "streaming";
  const busy = streaming || status.state === "downloading" || (status.state === "loading" && status.progress !== undefined);
  const picker =
    models.length > 1 ? (
      <ModelPicker models={models} disabled={busy} onSelect={(id) => void chat.selectModel?.(id).catch(() => {})} />
    ) : null;
  // a cached model loading from disk (`loading` with progress) shows the same card, worded as a load
  const downloadCard =
    current.prepare &&
    (status.state === "needs-download" ||
      status.state === "downloading" ||
      status.state === "error" ||
      (status.state === "loading" && status.progress !== undefined)) ? (
      <DownloadCard
        status={status}
        bytes={size.current}
        onDownload={startDownload}
        onCancel={() => download.current?.abort()}
        onUseOther={other ? () => choose(other.id) : undefined}
        otherLabel={other ? adapterLabel(other, t) : undefined}
      />
    ) : null;

  const last = session.messages.at(-1);
  const busyTool = last?.parts.some((p) => p.type === "tool" && (p.state === "running" || p.state === "awaiting-confirmation"));
  const thinking = streaming && !busyTool && !(last?.role === "assistant" && last.parts.at(-1)?.type === "text");
  const chips = suggestions === false ? [] : (suggestions ?? chat.suggestions);
  // a tool parked on the page for the person's click: said once for screen readers (the card changes in place)
  const parked = last?.parts.find((p) => p.type === "tool" && p.state === "awaiting-confirmation");
  const announcement = parked?.type === "tool" ? t("live.waitingForYou", { tool: parked.name }) : "";
  const errorCode = session.status === "error" && session.error ? chatErrorCode(session.error.code) : undefined;

  if (!host) return null;

  // ---------- 5. the parts, each replaceable ----------
  const C = ctx.components;
  const header = C.Header ? (
    <C.Header
      {...slotProps(ctx, "header", "wa-chat__header")}
      title={title}
      titleId={titleId}
      close={close}
      reset={reset}
      canReset={session.messages.length > 0}
    />
  ) : (
    <header {...part("header", "wa-chat__header")}>
      <h2 {...part("title")} id={titleId}>
        {title}
      </h2>
      {session.messages.length > 0 && (
        <button
          type="button"
          {...part("newChat", "wa-chat__icon")}
          onClick={reset}
          aria-label={t("header.newChat")}
          title={t("header.newChat")}
        >
          <Icon name="reset" />
        </button>
      )}
      <button type="button" {...part("close", "wa-chat__icon")} onClick={close} aria-label={t("header.close")}>
        <Icon name="close" />
      </button>
    </header>
  );

  const emptyChildren: ReactNode = (
    <>
      {chips.length > 0 && !unavailable && <Suggestions items={chips} onPick={send} />}
      {downloadCard}
    </>
  );
  const emptyTitle = t("empty.title");
  const empty = C.Empty ? (
    <C.Empty {...slotProps(ctx, "empty", "wa-chat__empty", emptyChildren)} />
  ) : (
    <div {...part("empty", "wa-chat__empty")}>
      {emptyTitle && <h3 {...part("emptyTitle", "wa-chat__empty-title")}>{emptyTitle}</h3>}
      <p {...part("emptyHint")}>{t("empty.hint")}</p>
      {emptyChildren}
    </div>
  );

  const retry = errorCode && errorCode !== "chat_disabled" ? session.retry : undefined;
  const error = !errorCode ? null : C.Error ? (
    <C.Error {...slotProps(ctx, "error", "wa-chat__error")} code={errorCode} retry={retry} />
  ) : (
    <div {...part("error", "wa-chat__error")} role="alert" data-state={errorCode}>
      <p {...part("errorText")}>{t(`errors.${errorCode}`)}</p>
      {retry && (
        <button type="button" {...part("retry", "wa-chat__link")} onClick={retry}>
          {t("retry")}
        </button>
      )}
    </div>
  );

  const toggle = () => (open ? close() : setOpen(true));
  const launcherLabel = t(open ? "launcher.close" : "launcher.open", { title });
  const launcher = C.Launcher ? (
    <C.Launcher {...slotProps(ctx, "launcher", "wa-chat__launcher")} open={open} toggle={toggle} busy={streaming} />
  ) : (
    <button
      ref={launcherRef}
      type="button"
      {...part("launcher", "wa-chat__launcher")}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={launcherLabel}
      onClick={toggle}
      data-open={open}
      data-busy={streaming || undefined}
    >
      <Icon name={open ? "close" : "chat"} />
    </button>
  );

  return createPortal(
    <ChatProvider value={ctx}>
      {themeCss && <style data-wa-part="root">{themeCss}</style>}
      <div
        id={panelId}
        {...part("panel", "wa-chat__panel", layout === "docked" ? ({ "--wa-chat-width": `${dock.width}px` } as CSSProperties) : undefined)}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-state={open ? "open" : "closed"}
        data-open={open}
        data-busy={streaming || undefined}
        hidden={!open}
        onKeyDown={onKeyDown}
      >
        {dock.active && <ResizeHandle side={side} width={dock.width} onResize={dock.setWidth} />}
        {header}
        {all.length > 1 && <AdapterSwitcher adapters={all} value={current.id} disabled={streaming} onChange={choose} />}
        {picker}

        {session.messages.length === 0 ? (
          empty
        ) : (
          <>
            <MessageList messages={session.messages} thinking={thinking} busy={streaming} onRestore={(id) => void restore(id)} />
            {downloadCard}
          </>
        )}

        {error}

        {restoredNote && (
          <p {...part("restored", "wa-chat__restored")} role="status">
            {t("restore.done")}
          </p>
        )}

        <p {...part("announcer", "wa-chat__sr", unstyled ? SR_ONLY : undefined)} aria-live="polite">
          {announcement}
        </p>

        <Composer
          inputRef={inputRef}
          streaming={streaming}
          unavailable={unavailable}
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={session.stop}
        />
      </div>

      {launcher}
    </ChatProvider>,
    host,
  );
}
