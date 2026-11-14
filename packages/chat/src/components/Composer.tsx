import { type FormEvent, type KeyboardEvent, type RefObject, useId } from "react";
import { SendIcon, StopIcon } from "./icons";

export interface ComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  streaming: boolean;
  /** Why the composer is disabled (the adapter isn't ready), or null. */
  unavailable: string | null;
  /** Controlled draft (so restore can put the dropped user text back). */
  value: string;
  onChange(text: string): void;
  onSend(text: string): void;
  onStop(): void;
}

export function Composer({ inputRef, streaming, unavailable, value, onChange, onSend, onStop }: ComposerProps) {
  const hintId = useId();

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (streaming || unavailable || !value.trim()) return;
    onSend(value);
    onChange("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline; never while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  }

  return (
    <form className="wa-chat__composer" onSubmit={submit}>
      {unavailable && (
        <p id={hintId} className="wa-chat__offline">
          {unavailable}
        </p>
      )}
      <div className="wa-chat__field">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about this page"
          aria-label="Message the assistant"
          aria-describedby={unavailable ? hintId : undefined}
          disabled={!!unavailable}
        />
        {streaming ? (
          <button type="button" className="wa-chat__send" onClick={onStop} aria-label="Stop">
            <StopIcon />
          </button>
        ) : (
          <button type="submit" className="wa-chat__send" aria-label="Send" disabled={!!unavailable || !value.trim()}>
            <SendIcon />
          </button>
        )}
      </div>
    </form>
  );
}
