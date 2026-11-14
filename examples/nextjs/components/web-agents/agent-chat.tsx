"use client";
/**
 * The web-agents chat on shadcn/ui's AI patterns: a floating panel with the thread (Message Scroller + Message +
 * Bubble), the assistant's parts (text through Streamdown, Reasoning, Tool, Subagent), Suggestion chips, a Prompt Input
 * with the Model Selector in its footer. State comes from `useAgentChat`; every tool call still runs on the live page
 * under the agent cursor, and anything confirm-gated waits for the person's click there.
 *
 * The code is yours: restyle or rearrange it like any shadcn component.
 */
import { type AgentChatState, createCloudAdapter, type UseAgentChatOptions, useAgentChat } from "@webmcp-agents/chat";
import { MessageSquareIcon, PlusIcon, SendIcon, SquareIcon, Undo2Icon, XIcon } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
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

export interface AgentChatBlockProps extends Partial<UseAgentChatOptions> {
  title?: string;
  defaultOpen?: boolean;
  /** Which corner. Default "bottom-right". */
  position?: "bottom-right" | "bottom-left";
}

/** The parts of one assistant message. */
function Parts({ message, chat }: { message: AgentChatState["messages"][number]; chat: AgentChatState }) {
  return (
    <>
      {message.parts.map((part, i) => {
        // a message's parts only grow at the end, so the position is a stable key for parts without an id
        const key = part.type === "dynamic-tool" ? part.toolCallId : `${message.id}-${i}`;
        if (part.type === "text") return part.text.trim() ? <Streamdown key={key}>{part.text}</Streamdown> : null;
        if (part.type === "reasoning") return <AgentReasoning key={key} part={part} />;
        if (part.type !== "dynamic-tool") return null;
        const phase = chat.toolPhase(part);
        return part.toolName.startsWith("delegate_to_") ? (
          <AgentSubagent key={key} part={part} phase={phase} toolPhase={chat.toolPhase} />
        ) : (
          <AgentTool key={key} part={part} phase={phase} />
        );
      })}
    </>
  );
}

const mb = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

/** What the adapter needs before it can answer (a model download, a load from disk), or nothing. */
function AdapterCard({ chat }: { chat: AgentChatState }) {
  const s = chat.adapterStatus;
  if (s.state === "ready" || !chat.prepare) return null;
  if (s.state === "needs-download") {
    return (
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>Run the assistant on this device</ItemTitle>
          <ItemDescription>
            {s.bytes ? `Downloads ${mb(s.bytes)} once. ` : ""}Nothing you type leaves your browser.{s.note ? ` ${s.note}` : ""}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" onClick={() => void chat.prepare?.().catch(() => {})}>
            Download
          </Button>
        </ItemActions>
      </Item>
    );
  }
  if (s.state === "downloading" || (s.state === "loading" && s.progress !== undefined)) {
    const pct = Math.round((s.progress ?? 0) * 100);
    return (
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>{s.state === "loading" ? "Loading the model from this device…" : "Downloading the model…"}</ItemTitle>
          <ItemDescription>{pct}%</ItemDescription>
        </ItemContent>
      </Item>
    );
  }
  if (s.state === "error") {
    return (
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>The model couldn't load</ItemTitle>
          <ItemDescription>{s.error}</ItemDescription>
        </ItemContent>
      </Item>
    );
  }
  return null;
}

export function AgentChatBlock({
  adapter,
  adapters,
  agent,
  storageKey,
  getSnapshot,
  applySnapshot,
  title = "Assistant",
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
  });
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  /** User message id waiting for a second click before `restore` runs. */
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoredNote, setRestoredNote] = useState(false);
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();
  const stageIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const m of chat.messages) {
      if (m.role === "user") map.set(m.id, ++n);
    }
    return map;
  }, [chat.messages]);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const unavailable =
    chat.adapterStatus.state === "unavailable"
      ? chat.adapterStatus.reason
      : chat.adapterStatus.state === "loading" && chat.adapterStatus.progress === undefined
        ? "Connecting to the assistant…"
        : chat.adapterStatus.state !== "ready"
          ? "The model isn't ready yet."
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
    if (busy || unavailable || !text.trim()) return;
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
    if (!text) return "Message";
    return text.length > 42 ? `${text.slice(0, 41)}…` : text;
  }
  function canRestore(index: number): boolean {
    const m = chat.messages[index];
    if (!m || m.role !== "user") return false;
    if (index >= chat.messages.length - 1) return false;
    if (busy && index === chat.messages.length - 1) return false;
    return true;
  }

  if (!open) {
    return (
      <Button className={`fixed ${corner} z-50 shadow-lg`} onClick={() => setOpen(true)} aria-expanded={false} data-web-agents-ui="chat">
        <MessageSquareIcon /> {title}
      </Button>
    );
  }
  return (
    // data-web-agents-ui: typing here never counts as the person taking over from the agent cursor
    <section
      data-web-agents-ui="chat"
      aria-label={title}
      className={`fixed ${corner} z-50 flex h-[min(640px,calc(100dvh-2rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-xl`}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          {chat.messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                clearRestoredNote();
                chat.clear();
              }}
              aria-label="New chat"
            >
              <PlusIcon />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close assistant">
            <XIcon />
          </Button>
        </div>
      </header>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="px-3 py-3">
            <MessageScrollerContent>
              {chat.messages.length === 0 && (
                <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                  <p>
                    Ask me to do something on this page. You'll see each step happen, and anything that orders, books or deletes waits for
                    your click.
                  </p>
                  {!unavailable && (
                    <div className="flex flex-wrap gap-2">
                      {chat.suggestions.map((s) => (
                        <Button key={s} variant="outline" size="sm" onClick={() => chat.sendMessage({ text: s })}>
                          {s}
                        </Button>
                      ))}
                    </div>
                  )}
                  <AdapterCard chat={chat} />
                </div>
              )}
              {chat.messages.map((m, i) => {
                const stageIndex = stageIndexById.get(m.id);
                const label = stageIndex != null ? stageLabel(m) : "";
                const restorable = stageIndex != null && canRestore(i);
                return (
                  <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"}>
                    <Message align={m.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        {m.role === "user" ? (
                          <div className="flex flex-col items-end gap-1">
                            <Bubble align="end">
                              <BubbleContent>{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</BubbleContent>
                            </Bubble>
                            {restorable && (
                              <div className="flex flex-col items-end gap-1">
                                {restoreId === m.id ? (
                                  <>
                                    <p className="text-right text-xs text-muted-foreground">Remove this turn and everything after?</p>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 gap-1 px-2 text-xs text-destructive"
                                        aria-label={`Confirm restore to stage ${stageIndex}`}
                                        title={`Restore to before: ${label}`}
                                        onClick={() => {
                                          setRestoreId(null);
                                          void chat.restore(m.id).then((result) => {
                                            if (!result) return;
                                            setText(result.restoredText);
                                            showRestoredNote();
                                          });
                                        }}
                                      >
                                        Restore
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground"
                                        aria-label="Cancel restore"
                                        onClick={() => setRestoreId(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                                    aria-label={`Restore to stage ${stageIndex}: ${label}`}
                                    title="Restore to before this message"
                                    onClick={() => setRestoreId(m.id)}
                                  >
                                    <Undo2Icon className="size-3.5" />
                                    Restore
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Parts message={m} chat={chat} />
                        )}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                );
              })}
              {chat.messages.length > 0 && <AdapterCard chat={chat} />}
              {chat.status === "error" && chat.error && (
                <Item variant="outline" size="sm" role="alert">
                  <ItemContent>
                    <ItemDescription>{chat.error.message}</ItemDescription>
                  </ItemContent>
                  {chat.error.code !== "chat_disabled" && (
                    <ItemActions>
                      <Button variant="outline" size="sm" onClick={chat.regenerate}>
                        Try again
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton className="absolute right-3 bottom-3" />
        </MessageScroller>
      </MessageScrollerProvider>

      {restoredNote && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground" role="status">
          Restored — edit and send again.
        </p>
      )}

      <form onSubmit={submit} className="border-t p-2">
        <InputGroup>
          <InputGroupTextarea
            id={inputId}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={unavailable ?? "Ask about this page"}
            aria-label="Message the assistant"
            disabled={!!unavailable}
          />
          <InputGroupAddon align="block-end">
            <AgentModelSelector chat={chat} disabled={busy} />
            {busy ? (
              <InputGroupButton className="ml-auto" variant="default" size="icon-xs" onClick={chat.stop} aria-label="Stop">
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                className="ml-auto"
                variant="default"
                size="icon-xs"
                type="submit"
                disabled={!!unavailable || !text.trim()}
                aria-label="Send"
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
