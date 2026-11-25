import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SR_ONLY, slotProps, useChatContext, usePart } from "../customize/context";
import type { Translate } from "../customize/types";
import { canRestoreTo } from "../session/reducer";
import { messageText } from "../session/restore-journal";
import type { AgentMessage } from "../types";
import { Icon } from "./icons";
import { Text } from "./Text";
import { delegateAnswer, ToolCallCard } from "./ToolCallCard";

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The parts to show. A reply that only repeats, word for word, what a sub-agent just answered (already shown in its
 * card) is left out: models relay a delegate's answer even when told not to. Reasoning shows only through a page's
 * own `Reasoning` part.
 */
function visibleParts(message: AgentMessage, reasoning: boolean): AgentMessage["parts"] {
  const answers = new Set<string>();
  return message.parts.filter((p) => {
    if (p.type === "reasoning") return reasoning && !!p.text.trim();
    if (p.type === "tool") {
      const answer = delegateAnswer(p);
      if (answer) answers.add(answer);
      return true;
    }
    return p.type !== "text" || (!!p.text.trim() && !answers.has(normalize(p.text)));
  });
}

/** Short label for a restore control (the user message, cut to fit an accessible name). */
function stageLabel(message: AgentMessage, t: Translate): string {
  const text = messageText(message).trim();
  if (!text) return t("restore.untitled");
  return text.length > 42 ? `${text.slice(0, 41)}…` : text;
}

/** The restore control under one user message: ask, then confirm or cancel. `components.Restore` replaces it. */
function Restore({
  message,
  confirming,
  ask,
  confirm,
  cancel,
}: {
  message: AgentMessage;
  confirming: boolean;
  ask(): void;
  confirm(): void;
  cancel(): void;
}) {
  const ctx = useChatContext();
  const part = usePart();
  const { t } = ctx;
  const Custom = ctx.components.Restore;
  if (Custom) {
    const props = slotProps(ctx, "restore", "wa-chat__stage");
    return (
      <Custom
        {...props}
        partProps={{ ...props.partProps, ...{ "data-state": confirming ? "confirming" : "idle" } }}
        message={message}
        confirming={confirming}
        ask={ask}
        confirm={confirm}
        cancel={cancel}
      />
    );
  }
  return (
    // icon-only: the tooltips (`title`) and accessible names carry the words
    <div {...part("restore", "wa-chat__stage")} data-state={confirming ? "confirming" : "idle"}>
      {confirming ? (
        <fieldset {...part("restoreActions", "wa-chat__stage-actions")} aria-label={t("restore.confirmQuestion")}>
          <button
            type="button"
            {...part("restoreConfirm", "wa-chat__stage-go")}
            aria-label={t("restore.confirm")}
            title={t("restore.confirm")}
            onClick={confirm}
          >
            <Icon name="check" />
          </button>
          <button
            type="button"
            {...part("restoreCancel", "wa-chat__stage-cancel")}
            aria-label={t("restore.cancel")}
            title={t("restore.cancel")}
            onClick={cancel}
          >
            <Icon name="cancel" />
          </button>
        </fieldset>
      ) : (
        <button
          type="button"
          {...part("restoreAsk", "wa-chat__stage-ask")}
          aria-label={t("restore.button", { message: stageLabel(message, t) })}
          title={t("restore.hint")}
          onClick={ask}
        >
          <Icon name="restore" />
        </button>
      )}
    </div>
  );
}

function Message({
  message,
  streaming,
  restorable,
  confirming,
  onAskRestore,
  onConfirmRestore,
  onCancelRestore,
}: {
  message: AgentMessage;
  streaming: boolean;
  restorable?: boolean;
  confirming?: boolean;
  onAskRestore?: () => void;
  onConfirmRestore?: () => void;
  onCancelRestore?: () => void;
}) {
  const ctx = useChatContext();
  const part = usePart();
  const Reasoning = ctx.components.Reasoning;
  const visible = visibleParts(message, !!Reasoning);
  if (visible.length === 0) return null;
  const body = (
    <div {...part("messageBody", "wa-chat__message-body")}>
      {visible.map((p, i) =>
        p.type === "tool" ? (
          <ToolCallCard key={p.id} part={p} />
        ) : p.type === "text" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a message's parts only grow at the end
          <div key={i} {...part("bubble", "wa-chat__bubble")}>
            <Text text={p.text} streaming={streaming && i === visible.length - 1} />
          </div>
        ) : p.type === "reasoning" && Reasoning ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a message's parts only grow at the end
          <Reasoning key={i} {...slotProps(ctx, "reasoning")} text={p.text} />
        ) : null,
      )}
      {restorable && (
        <Restore
          message={message}
          confirming={!!confirming}
          ask={() => onAskRestore?.()}
          confirm={() => onConfirmRestore?.()}
          cancel={() => onCancelRestore?.()}
        />
      )}
    </div>
  );
  const attrs = { "data-role": message.role, "data-confirming": confirming || undefined };
  const Custom = ctx.components.Message;
  if (Custom) {
    const props = slotProps(ctx, "message", "wa-chat__message", body);
    return <Custom {...props} partProps={{ ...props.partProps, ...attrs }} message={message} />;
  }
  return (
    <div {...part("message", "wa-chat__message")} {...attrs}>
      {body}
    </div>
  );
}

const NEAR_BOTTOM = 48;

/** The conversation: a live log of messages, the "working" indicator, and a way back to the newest message. */
export function MessageList({
  messages,
  thinking,
  busy = false,
  onRestore,
}: {
  messages: AgentMessage[];
  thinking: boolean;
  /** A run is under way (sending, streaming, calling tools): no restore control shows until it ends. */
  busy?: boolean;
  onRestore?: (messageId: string) => void;
}) {
  const { t, unstyled } = useChatContext();
  const part = usePart();
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [behind, setBehind] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  /**
   * The user messages a restore control shows under (`canRestoreTo`: never before a confirmed action). None while a run
   * is under way: the turn is still changing, and a restore would stop it mid-step.
   */
  const restorable = useMemo(
    () => new Set(onRestore && !busy ? messages.filter((m) => canRestoreTo(messages, m.id)).map((m) => m.id) : []),
    [messages, onRestore, busy],
  );

  // Follow new content only while the person is at the bottom; otherwise offer a way back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every new part or state change
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pinned) el.scrollTop = el.scrollHeight;
    else setBehind(true);
  }, [messages, thinking]);

  useEffect(() => {
    if (pinned) setBehind(false);
  }, [pinned]);

  useEffect(() => {
    if (confirmingId && !restorable.has(confirmingId)) setConfirmingId(null);
  }, [confirmingId, restorable]);

  const lastId = messages.at(-1)?.id;
  return (
    <div {...part("scroll", "wa-chat__scroll")}>
      <div
        ref={ref}
        {...part("messages", "wa-chat__log")}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t("conversation.label")}
        data-busy={busy || undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM);
        }}
      >
        {messages.map((m) => {
          const canRestore = restorable.has(m.id);
          return (
            <Message
              key={m.id}
              message={m}
              streaming={busy && m.id === lastId}
              restorable={canRestore}
              confirming={confirmingId === m.id}
              onAskRestore={canRestore ? () => setConfirmingId(m.id) : undefined}
              onConfirmRestore={
                canRestore
                  ? () => {
                      setConfirmingId(null);
                      onRestore?.(m.id);
                    }
                  : undefined
              }
              onCancelRestore={canRestore ? () => setConfirmingId(null) : undefined}
            />
          );
        })}
        {thinking && (
          <div {...part("working", "wa-chat__typing")} role="status">
            <span {...part("workingDot")} />
            <span {...part("workingDot")} />
            <span {...part("workingDot")} />
            <span {...part("workingLabel", "wa-chat__sr", unstyled ? SR_ONLY : undefined)}>{t("conversation.working")}</span>
          </div>
        )}
      </div>
      {behind && (
        <button
          type="button"
          {...part("jumpToLatest", "wa-chat__jump")}
          onClick={() => {
            const el = ref.current;
            if (el) el.scrollTop = el.scrollHeight;
            setPinned(true);
          }}
        >
          <Icon name="down" /> {t("conversation.jumpToLatest")}
        </button>
      )}
    </div>
  );
}
