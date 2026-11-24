import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { canRestoreTo } from "../session/reducer";
import { messageText } from "../session/restore-journal";
import type { AgentMessage } from "../types";
import { CancelIcon, CheckIcon, DownIcon, RestoreIcon } from "./icons";
import { Text } from "./Text";
import { delegateAnswer, ToolCallCard } from "./ToolCallCard";

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * The parts to show. A reply that only repeats, word for word, what a sub-agent just answered (already shown in its
 * card) is left out: models relay a delegate's answer even when told not to.
 */
function visibleParts(message: AgentMessage): AgentMessage["parts"] {
  const answers = new Set<string>();
  return message.parts.filter((p) => {
    if (p.type === "reasoning") return false;
    if (p.type === "tool") {
      const answer = delegateAnswer(p);
      if (answer) answers.add(answer);
      return true;
    }
    return p.type !== "text" || (!!p.text.trim() && !answers.has(normalize(p.text)));
  });
}

/** Short label for a restore control (the user message, cut to fit an accessible name). */
function stageLabel(message: AgentMessage): string {
  const text = messageText(message).trim();
  if (!text) return "Message";
  return text.length > 42 ? `${text.slice(0, 41)}…` : text;
}

const CONFIRM_RESTORE = "Remove this turn and everything after";

function Message({
  message,
  restorable,
  confirming,
  onAskRestore,
  onConfirmRestore,
  onCancelRestore,
}: {
  message: AgentMessage;
  restorable?: boolean;
  confirming?: boolean;
  onAskRestore?: () => void;
  onConfirmRestore?: () => void;
  onCancelRestore?: () => void;
}) {
  const visible = visibleParts(message);
  if (visible.length === 0) return null;
  const label = restorable ? stageLabel(message) : "";
  return (
    <div className="wa-chat__message" data-role={message.role} data-confirming={confirming || undefined}>
      <div className="wa-chat__message-body">
        {visible.map((part, i) =>
          part.type === "tool" ? (
            <ToolCallCard key={part.id} part={part} />
          ) : part.type === "text" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a message's parts only grow at the end
            <div key={i} className="wa-chat__bubble">
              <Text text={part.text} />
            </div>
          ) : null,
        )}
        {restorable && (
          // icon-only: the tooltips (`title`) and accessible names carry the words
          <div className="wa-chat__stage">
            {confirming ? (
              <fieldset className="wa-chat__stage-actions" aria-label={`${CONFIRM_RESTORE}?`}>
                <button
                  type="button"
                  className="wa-chat__stage-go"
                  aria-label={CONFIRM_RESTORE}
                  title={CONFIRM_RESTORE}
                  onClick={onConfirmRestore}
                >
                  <CheckIcon />
                </button>
                <button type="button" className="wa-chat__stage-cancel" aria-label="Cancel" title="Cancel" onClick={onCancelRestore}>
                  <CancelIcon />
                </button>
              </fieldset>
            ) : (
              <button
                type="button"
                className="wa-chat__stage-ask"
                aria-label={`Restore to before: ${label}`}
                title="Restore to before this message"
                onClick={onAskRestore}
              >
                <RestoreIcon />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const NEAR_BOTTOM = 48;

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

  return (
    <div className="wa-chat__scroll">
      <div
        ref={ref}
        className="wa-chat__log"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
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
          <div className="wa-chat__typing" role="status">
            <span />
            <span />
            <span />
            <span className="wa-chat__sr">The assistant is working</span>
          </div>
        )}
      </div>
      {behind && (
        <button
          type="button"
          className="wa-chat__jump"
          onClick={() => {
            const el = ref.current;
            if (el) el.scrollTop = el.scrollHeight;
            setPinned(true);
          }}
        >
          <DownIcon /> Jump to latest
        </button>
      )}
    </div>
  );
}
