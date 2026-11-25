"use client";
/**
 * The web-agents chat on shadcn/ui's AI patterns: a floating panel with the thread (Message Scroller + Message +
 * Bubble), the assistant's parts (text through Streamdown, Reasoning, Tool, Subagent), Suggestion chips, a Prompt Input
 * with the Model Selector in its footer. State comes from `useAgentChat`; every tool call still runs on the live page
 * under the agent cursor, and anything confirm-gated waits for the person's click there.
 *
 * The code is yours: restyle or rearrange it like any shadcn component.
 */
import {
  type AgentChatState,
  type ChatPart,
  createCloudAdapter,
  directionOf,
  type UseAgentChatOptions,
  useAgentChat,
} from "@webmcp-agents/chat";
import { CheckIcon, MessageSquareIcon, PlusIcon, SendIcon, SquareIcon, Undo2Icon, XIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { AgentModelSelector } from "@/components/web-agents/agent-model-selector";
import { AgentReasoning } from "@/components/web-agents/agent-reasoning";
import { AgentSubagent } from "@/components/web-agents/agent-subagent";
import { AgentTool } from "@/components/web-agents/agent-tool";

const DEFAULT_ADAPTERS = [createCloudAdapter()];

/**
 * The block's props: `useAgentChat`'s (with `messages` and `locale`: every string comes from the chat's catalog, as in
 * `<AgentChat>`), plus `classNames` per part (the same part names as `<AgentChat>`'s `data-wa-part`).
 */
export interface AgentChatBlockProps extends Partial<UseAgentChatOptions> {
  /** The panel's heading. Default: the catalog's `title` ("Assistant"). */
  title?: string;
  defaultOpen?: boolean;
  /** Which corner. Default "bottom-right". */
  position?: "bottom-right" | "bottom-left";
  /** Extra classes per part, added after the block's own. */
  classNames?: Partial<Record<ChatPart, string>>;
}

/** The parts of one assistant message. */
function Parts({ message, chat }: { message: AgentChatState["messages"][number]; chat: AgentChatState }) {
  const { t } = chat;
  return (
    <>
      {message.parts.map((part, i) => {
        // a message's parts only grow at the end, so the position is a stable key for parts without an id
        const key = part.type === "dynamic-tool" ? part.toolCallId : `${message.id}-${i}`;
        if (part.type === "text") return part.text.trim() ? <Streamdown key={key}>{part.text}</Streamdown> : null;
        if (part.type === "reasoning") return <AgentReasoning key={key} part={part} t={t} />;
        if (part.type !== "dynamic-tool") return null;
        const phase = chat.toolPhase(part);
        return part.toolName.startsWith("delegate_to_") ? (
          <AgentSubagent key={key} part={part} phase={phase} toolPhase={chat.toolPhase} t={t} />
        ) : (
          <AgentTool key={key} part={part} phase={phase} t={t} />
        );
      })}
    </>
  );
}

/** What the adapter needs before it can answer (a model download, a load from disk), or nothing. */
function AdapterCard({ chat, className }: { chat: AgentChatState; className?: string }) {
  const { t } = chat;
  const s = chat.adapterStatus;
  if (s.state === "ready" || !chat.prepare) return null;
  if (s.state === "needs-download") {
    return (
      <Item variant="outline" size="sm" data-wa-part="downloadCard" data-state={s.state} className={className}>
        <ItemContent>
          <ItemTitle>{t("download.offer")}</ItemTitle>
          <ItemDescription>
            {s.bytes ? `${t("download.size", { size: t.format.bytes(s.bytes) })} ` : ""}
            {t("download.privacy")}
            {s.note ? ` ${s.note}` : ""}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" onClick={() => void chat.prepare?.().catch(() => {})}>
            {t("download.start")}
          </Button>
        </ItemActions>
      </Item>
    );
  }
  if (s.state === "downloading" || (s.state === "loading" && s.progress !== undefined)) {
    const progress = s.progress ?? 0;
    return (
      <Item variant="outline" size="sm" data-wa-part="downloadCard" data-state={s.state} className={className}>
        <ItemContent>
          <ItemTitle>{s.state === "loading" ? t("download.loadingTitle") : t("download.title")}</ItemTitle>
          <ItemDescription>
            {t("download.progress", { percent: Math.round(progress * 100), formatted: t.format.percent(progress) })}
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  }
  if (s.state === "error") {
    return (
      <Item variant="outline" size="sm" data-wa-part="downloadCard" data-state="error" className={className}>
        <ItemContent>
          <ItemTitle>{t("download.loadFailed")}</ItemTitle>
          <ItemDescription>{s.error}</ItemDescription>
        </ItemContent>
      </Item>
    );
  }
  return null;
}

/** The block's classes, then the page's for that part (`classNames`): no merging, the page's come last. */
const cn = (...classes: (string | undefined)[]): string => classes.filter(Boolean).join(" ");

export function AgentChatBlock({
  adapter,
  adapters,
  agent,
  storageKey,
  getSnapshot,
  applySnapshot,
  messages,
  locale,
  classNames = {},
  title: titleProp,
  defaultOpen = false,
  position = "bottom-right",
}: AgentChatBlockProps) {
  const corner = position === "bottom-left" ? "left-4 bottom-4" : "right-4 bottom-4";
  const chat = useAgentChat({
    adapter,
    adapters: adapters ?? (adapter ? undefined : DEFAULT_ADAPTERS),
    agent,
    storageKey,
    getSnapshot,
    applySnapshot,
    messages,
    locale,
  });
  const { t } = chat;
  const title = titleProp ?? t("title");
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  /** User message id waiting for a second click before `restore` runs. */
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoredNote, setRestoredNote] = useState(false);
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoring = useRef(false);
  const inputId = useId();
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const status = chat.adapterStatus;
  const unavailable =
    status.state === "unavailable"
      ? status.code
        ? t(`errors.${status.code}`)
        : status.reason
      : status.state === "loading" && status.progress === undefined
        ? t("status.connecting")
        : status.state !== "ready"
          ? t("status.notReady")
          : null;

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
  function submit(e?: FormEvent) {
    e?.preventDefault();
    // while a restore is under way nothing is sent: keep the text (the restored message is put before it)
    if (busy || unavailable || restoring.current || !text.trim()) return;
    clearRestoredNote();
    chat.sendMessage({ text });
    setText("");
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  }
  function stageLabel(m: (typeof chat.messages)[number]): string {
    const text = m.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    if (!text) return t("restore.untitled");
    return text.length > 42 ? `${text.slice(0, 41)}…` : text;
  }

  if (!open) {
    return (
      <Button
        className={cn(`fixed ${corner} z-50 shadow-lg`, classNames.launcher)}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        data-web-agents-ui="chat"
        data-wa-part="launcher"
        dir={directionOf(t.locale)}
        lang={t.locale}
      >
        <MessageSquareIcon /> {title}
      </Button>
    );
  }
  return (
    // data-web-agents-ui: typing here never counts as the person taking over from the agent cursor
    <section
      data-web-agents-ui="chat"
      data-wa-part="root"
      aria-label={title}
      dir={directionOf(t.locale)}
      lang={t.locale}
      className={cn(
        `fixed ${corner} z-50 flex h-[min(640px,calc(100dvh-2rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-xl`,
        classNames.root,
        classNames.panel,
      )}
    >
      <header data-wa-part="header" className={cn("flex items-center gap-2 border-b px-3 py-2", classNames.header)}>
        <h2 data-wa-part="title" className={cn("text-sm font-medium", classNames.title)}>
          {title}
        </h2>
        <div className="ms-auto flex items-center gap-1">
          {chat.messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                clearRestoredNote();
                chat.clear();
              }}
              aria-label={t("header.newChat")}
              data-wa-part="newChat"
              className={classNames.newChat}
            >
              <PlusIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            aria-label={t("header.close")}
            data-wa-part="close"
            className={classNames.close}
          >
            <XIcon />
          </Button>
        </div>
      </header>

      <MessageScrollerProvider autoScroll>
        <MessageScroller data-wa-part="messages" aria-label={t("conversation.label")} className={cn("min-h-0 flex-1", classNames.messages)}>
          <MessageScrollerViewport className="px-3 py-3">
            <MessageScrollerContent>
              {chat.messages.length === 0 && (
                <div data-wa-part="empty" className={cn("flex flex-col gap-3 text-sm text-muted-foreground", classNames.empty)}>
                  <p data-wa-part="emptyHint" className={classNames.emptyHint}>
                    {t("empty.hint")}
                  </p>
                  {!unavailable && (
                    <div data-wa-part="suggestions" className={cn("flex flex-wrap gap-2", classNames.suggestions)}>
                      {chat.suggestions.map((s) => (
                        <Button
                          key={s}
                          variant="outline"
                          size="sm"
                          data-wa-part="suggestion"
                          className={classNames.suggestion}
                          onClick={() => chat.sendMessage({ text: s })}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  )}
                  <AdapterCard chat={chat} className={classNames.downloadCard} />
                </div>
              )}
              {chat.messages.map((m) => {
                // never before a confirmed action (an order placed, a flight booked), nor while a run is under way
                const restorable = !busy && chat.canRestore(m.id);
                return (
                  <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"}>
                    <Message
                      align={m.role === "user" ? "end" : "start"}
                      data-wa-part="message"
                      data-role={m.role}
                      className={classNames.message}
                    >
                      <MessageContent>
                        {m.role === "user" ? (
                          <div className="group/turn flex flex-col items-end gap-1">
                            <Bubble align="end" data-wa-part="bubble" className={classNames.bubble}>
                              {/* room for the restore chip's top half, so it only covers padding, never text */}
                              <BubbleContent className={restorable ? "pb-3.5" : undefined}>
                                {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                              </BubbleContent>
                            </Bubble>
                            {/* icon-only: the tooltips (`title`) and accessible names carry the words. -mt-4 = the 4px gap +
                                half the 24px chip, so it sits half over the bubble's bottom edge. */}
                            {restorable &&
                              (restoreId === m.id ? (
                                <fieldset
                                  data-wa-part="restoreActions"
                                  className={cn(
                                    "relative -mt-4 me-2.5 flex min-w-0 items-center gap-0.5 rounded-full border-0 bg-background px-0.5 shadow-xs ring-1 ring-border",
                                    classNames.restoreActions,
                                  )}
                                  aria-label={t("restore.confirmQuestion")}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    data-wa-part="restoreConfirm"
                                    className={cn("rounded-full text-destructive", classNames.restoreConfirm)}
                                    aria-label={t("restore.confirm")}
                                    title={t("restore.confirm")}
                                    onClick={() => {
                                      setRestoreId(null);
                                      restoring.current = true;
                                      void chat
                                        .restore(m.id)
                                        .finally(() => {
                                          restoring.current = false;
                                        })
                                        .then((result) => {
                                          if (!result) return;
                                          // keep a half-written message: the restored text goes first, the draft after it
                                          setText((current) =>
                                            current.trim() ? `${result.restoredText}\n\n${current}` : result.restoredText,
                                          );
                                          showRestoredNote();
                                        });
                                    }}
                                  >
                                    <CheckIcon />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    data-wa-part="restoreCancel"
                                    className={cn("rounded-full text-muted-foreground", classNames.restoreCancel)}
                                    aria-label={t("restore.cancel")}
                                    title={t("restore.cancel")}
                                    onClick={() => setRestoreId(null)}
                                  >
                                    <XIcon />
                                  </Button>
                                </fieldset>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  // a chip half over the bubble's bottom edge; with a mouse, only while the message is hovered or the button has
                                  // focus (always on touch)
                                  data-wa-part="restoreAsk"
                                  className={cn(
                                    "relative -mt-4 me-2.5 rounded-full bg-background text-muted-foreground shadow-xs ring-1 ring-border transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/turn:opacity-100 focus-visible:opacity-100",
                                    classNames.restoreAsk,
                                  )}
                                  aria-label={t("restore.button", { message: stageLabel(m) })}
                                  title={t("restore.hint")}
                                  onClick={() => setRestoreId(m.id)}
                                >
                                  <Undo2Icon />
                                </Button>
                              ))}
                          </div>
                        ) : (
                          <Parts message={m} chat={chat} />
                        )}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
              {chat.messages.length > 0 && <AdapterCard chat={chat} className={classNames.downloadCard} />}
              {chat.status === "error" && chat.error && (
                <Item
                  variant="outline"
                  size="sm"
                  role="alert"
                  data-wa-part="error"
                  data-state={chat.error.code}
                  className={classNames.error}
                >
                  <ItemContent>
                    <ItemDescription data-wa-part="errorText">{chat.error.text}</ItemDescription>
                  </ItemContent>
                  {chat.error.code !== "chat_disabled" && (
                    <ItemActions>
                      <Button variant="outline" size="sm" data-wa-part="retry" className={classNames.retry} onClick={chat.regenerate}>
                        {t("retry")}
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton data-wa-part="jumpToLatest" className={cn("absolute end-3 bottom-3", classNames.jumpToLatest)} />
        </MessageScroller>
      </MessageScrollerProvider>

      {restoredNote && (
        <p data-wa-part="restored" className={cn("border-t px-3 py-2 text-xs text-muted-foreground", classNames.restored)} role="status">
          {t("restore.done")}
        </p>
      )}

      <form onSubmit={submit} data-wa-part="composer" className={cn("border-t p-2", classNames.composer)}>
        <InputGroup>
          <InputGroupTextarea
            id={inputId}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={unavailable ?? t("composer.placeholder")}
            aria-label={t("composer.label")}
            data-wa-part="input"
            className={classNames.input}
            disabled={!!unavailable}
          />
          <InputGroupAddon align="block-end">
            <AgentModelSelector chat={chat} disabled={busy} />
            {busy ? (
              <InputGroupButton
                className={cn("ms-auto", classNames.stop)}
                variant="default"
                size="icon-xs"
                onClick={chat.stop}
                aria-label={t("composer.stop")}
                data-wa-part="stop"
              >
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                className={cn("ms-auto", classNames.send)}
                variant="default"
                size="icon-xs"
                type="submit"
                disabled={!!unavailable || !text.trim()}
                aria-label={t("composer.send")}
                data-wa-part="send"
              >
                <SendIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </section>
  );
}
