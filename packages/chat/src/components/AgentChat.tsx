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
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { WebAgent } from "../agent";
import { useAgentChat } from "../session/use-agent-chat";
import type { AgentAdapter } from "../types";
import { AdapterSwitcher } from "./AdapterSwitcher";
import { Composer } from "./Composer";
import { ResizeHandle, useDock } from "./dock";
import { DownloadCard } from "./DownloadCard";
import { ChatIcon, CloseIcon, ResetIcon } from "./icons";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
import { Suggestions } from "./Suggestions";

/** Props of `<AgentChat>`. */
export interface AgentChatProps {
  /** What runs the model. Default: one shared `createCloudAdapter()` (your `/api/chat`), when `adapters` is not given either. */
  adapter?: AgentAdapter;
  /** Several agents: the panel shows a switcher (cloud, in-browser…). The first is the default. */
  adapters?: readonly AgentAdapter[];
  /**
   * The agent for this page (`defineWebAgent`): its instructions, the tools it may use and its sub-agents. Register
   * the same definition on the server (`createChatHandler({ agents })`). Default: every page tool, no instructions.
   */
  agent?: WebAgent;
  /** Panel title. Default "Assistant". */
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
  /** Extra class on the host element (theme with the `--wa-chat-*` properties). */
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

function useHost(className: string | undefined, position: string): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute(UI_HOST_ATTR, "chat");
    document.body.append(el);
    setHost(el);
    return () => el.remove();
  }, []);
  useEffect(() => {
    if (!host) return;
    host.className = ["wa-chat", className].filter(Boolean).join(" ");
    host.dataset.position = position;
  }, [host, className, position]);
  return host;
}

/** The chat launcher and panel. Render it inside `<WebAgentsProvider>` so the agent sees the tools the page has on. */
export function AgentChat({
  adapter,
  adapters,
  agent,
  title = "Assistant",
  defaultOpen = false,
  position = "bottom-right",
  layout = "docked",
  suggestions,
  className,
  storageKey,
}: AgentChatProps) {
  // one state source, shared with custom UIs: the adapter choice, the session, the adapter's status and models
  const chat = useAgentChat({ adapter, adapters, agent, storageKey });
  const { adapters: all, adapter: current, selectAdapter: choose, session } = chat;

  const host = useHost(className, position);
  const side = position === "bottom-left" ? "left" : "right";
  const [open, setOpen] = useOpen(defaultOpen, storageKey === false ? false : `${storageKey ?? "web-agents:chat"}:open`);
  const dock = useDock(open && layout === "docked", side);
  useEffect(() => {
    if (host) host.dataset.layout = layout;
  }, [host, layout]);
  const panelId = useId();
  const titleId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  // Opening puts the cursor in the composer.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function restore(messageId: string) {
    const result = await session.restore(messageId);
    if (!result) return;
    setDraft(result.restoredText);
    inputRef.current?.focus();
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

  const status = session.adapterStatus;
  const unavailable =
    status.state === "ready"
      ? null
      : status.state === "unavailable"
        ? status.reason
        : status.state === "error"
          ? status.error
          : status.state === "loading"
            ? status.progress === undefined
              ? "Connecting to the assistant…"
              : `Loading the model… ${Math.round(status.progress * 100)}%`
            : status.state === "downloading"
              ? `Downloading the model… ${Math.round(status.progress * 100)}%`
              : "Download the model to start.";

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
  const busy =
    session.status === "streaming" || status.state === "downloading" || (status.state === "loading" && status.progress !== undefined);
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
        otherLabel={other?.label}
      />
    ) : null;

  const last = session.messages.at(-1);
  const busyTool = last?.parts.some((p) => p.type === "tool" && (p.state === "running" || p.state === "awaiting-confirmation"));
  const thinking = session.status === "streaming" && !busyTool && !(last?.role === "assistant" && last.parts.at(-1)?.type === "text");
  const chips = suggestions === false ? [] : (suggestions ?? chat.suggestions);

  if (!host) return null;
  return createPortal(
    <>
      <div
        id={panelId}
        className="wa-chat__panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-state={open ? "open" : "closed"}
        hidden={!open}
        onKeyDown={onKeyDown}
        style={layout === "docked" ? ({ "--wa-chat-width": `${dock.width}px` } as CSSProperties) : undefined}
      >
        {dock.active && <ResizeHandle side={side} width={dock.width} onResize={dock.setWidth} />}
        <header className="wa-chat__header">
          <h2 id={titleId}>{title}</h2>
          {session.messages.length > 0 && (
            <button type="button" className="wa-chat__icon" onClick={session.reset} aria-label="New chat" title="New chat">
              <ResetIcon />
            </button>
          )}
          <button type="button" className="wa-chat__icon" onClick={close} aria-label="Close assistant">
            <CloseIcon />
          </button>
        </header>
        {all.length > 1 && (
          <AdapterSwitcher adapters={all} value={current.id} disabled={session.status === "streaming"} onChange={choose} />
        )}
        {picker}

        {session.messages.length === 0 ? (
          <div className="wa-chat__empty">
            <p>
              Ask me to do something on this page. You'll see each step happen, and anything that orders, books or deletes waits for your
              click.
            </p>
            {chips.length > 0 && !unavailable && <Suggestions items={chips} onPick={session.send} />}
            {downloadCard}
          </div>
        ) : (
          <>
            <MessageList messages={session.messages} thinking={thinking} onRestore={(id) => void restore(id)} />
            {downloadCard}
          </>
        )}

        {session.status === "error" && session.error && (
          <div className="wa-chat__error" role="alert">
            <p>{session.error.message}</p>
            {session.error.code !== "chat_disabled" && (
              <button type="button" className="wa-chat__link" onClick={session.retry}>
                Try again
              </button>
            )}
          </div>
        )}

        <Composer
          inputRef={inputRef}
          streaming={session.status === "streaming"}
          unavailable={unavailable}
          value={draft}
          onChange={setDraft}
          onSend={session.send}
          onStop={session.stop}
        />
      </div>

      <button
        ref={launcherRef}
        type="button"
        className="wa-chat__launcher"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? `Close ${title.toLowerCase()}` : `Open ${title.toLowerCase()}`}
        onClick={() => (open ? close() : setOpen(true))}
        data-busy={session.status === "streaming" || undefined}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </>,
    host,
  );
}
