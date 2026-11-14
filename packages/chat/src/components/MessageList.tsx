import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AgentMessage } from "../types";
import { DownIcon, RestoreIcon } from "./icons";
import { Text } from "./Text";
import { ToolCallCard } from "./ToolCallCard";

function Message({
  message,
  onRestore,
}: {
  message: AgentMessage;
  onRestore?: (messageId: string) => void;
}) {
  const visible = message.parts.filter((p) => p.type !== "reasoning" && (p.type !== "text" || p.text.trim()));
  if (visible.length === 0) return null;
  const user = message.role === "user";
  return (
    <div className="wa-chat__message" data-role={message.role}>
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
      {user && onRestore && (
        <button
          type="button"
          className="wa-chat__restore"
          aria-label="Restore to before this message"
          title="Restore to before this message"
          onClick={() => onRestore(message.id)}
        >
          <RestoreIcon />
          Restore
        </button>
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
        {messages.map((m) => (
          <Message key={m.id} message={m} onRestore={onRestore} />
        ))}
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
