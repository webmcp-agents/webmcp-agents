import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "../types";
import { DownIcon, RestoreIcon } from "./icons";
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

/** Short label for a restore control (first line of the user message). */
function stageLabel(message: AgentMessage): string {
  const text = message.parts
    .filter((p): p is Extract<AgentMessage["parts"][number], { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) return "Message";
  return text.length > 42 ? `${text.slice(0, 41)}…` : text;
}

/**
 * Whether Restore should show for this user message: there is something after it to drop, and it is not an
 * in-flight latest turn still waiting for the first assistant part.
 */
function canRestore(messages: readonly AgentMessage[], index: number, thinking: boolean): boolean {
  const message = messages[index];
  if (!message || message.role !== "user") return false;
  if (index >= messages.length - 1) {
    // sole trailing user message: only restore once a reply (or later turn) exists
    return false;
  }
  // latest user turn while the assistant has not started answering yet
  if (thinking && index === messages.length - 1) return false;
  return true;
}

function Message({
  message,
  stageIndex,
  restorable,
  confirming,
  onAskRestore,
  onConfirmRestore,
  onCancelRestore,
}: {
  message: AgentMessage;
  /** 1-based index when this is a user turn. */
  stageIndex?: number;
  restorable?: boolean;
  confirming?: boolean;
  onAskRestore?: () => void;
  onConfirmRestore?: () => void;
  onCancelRestore?: () => void;
}) {
  const visible = visibleParts(message);
  if (visible.length === 0) return null;
  const user = message.role === "user";
  const label = user ? stageLabel(message) : "";
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
      </div>
      {user && restorable && stageIndex != null && onAskRestore && (
        <div className="wa-chat__stage">
          {confirming ? (
            <div className="wa-chat__stage-confirm" role="group" aria-label={`Confirm restore to stage ${stageIndex}`}>
              <p className="wa-chat__stage-prompt">Remove this turn and everything after?</p>
              <div className="wa-chat__stage-actions">
                <button
                  type="button"
                  className="wa-chat__stage-go"
                  aria-label={`Confirm restore to stage ${stageIndex}`}
                  title={`Restore to before: ${label}`}
                  onClick={onConfirmRestore}
                >
                  Restore
                </button>
                <button type="button" className="wa-chat__stage-cancel" aria-label="Cancel restore" onClick={onCancelRestore}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="wa-chat__stage-ask"
              aria-label={`Restore to stage ${stageIndex}: ${label}`}
              title="Restore to before this message"
              onClick={onAskRestore}
            >
              <RestoreIcon />
              Restore
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const NEAR_BOTTOM = 48;

export function MessageList({
  messages,
  thinking,
  onRestore,
}: {
  messages: AgentMessage[];
  thinking: boolean;
  onRestore?: (messageId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [behind, setBehind] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const stageIndexById = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const m of messages) {
      if (m.role === "user") map.set(m.id, ++n);
    }
    return map;
  }, [messages]);

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
    if (confirmingId && !stageIndexById.has(confirmingId)) setConfirmingId(null);
  }, [confirmingId, stageIndexById]);

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
        {messages.map((m, i) => {
          const stageIndex = onRestore ? stageIndexById.get(m.id) : undefined;
          const restorable = stageIndex != null && canRestore(messages, i, thinking);
          return (
            <Message
              key={m.id}
              message={m}
              stageIndex={stageIndex}
              restorable={restorable}
              confirming={confirmingId === m.id}
              onAskRestore={restorable ? () => setConfirmingId(m.id) : undefined}
              onConfirmRestore={
                restorable
                  ? () => {
                      setConfirmingId(null);
                      onRestore?.(m.id);
                    }
                  : undefined
              }
              onCancelRestore={restorable ? () => setConfirmingId(null) : undefined}
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
