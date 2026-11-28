import { type FormEvent, type KeyboardEvent, type RefObject, useId } from "react";
import { slotProps, useChatContext, usePart } from "../customize/context";
import { Icon } from "./icons";

/** Props of the composer. */
export interface ComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  streaming: boolean;
  /** Why the composer is disabled (the adapter isn't ready), already in the page's language, or null. */
  unavailable: string | null;
  /** Controlled draft (so restore can put the dropped user text back). */
  value: string;
  onChange(text: string): void;
  /** Return `false` when the text wasn't sent (a restore is under way): the composer keeps it. */
  onSend(text: string): boolean;
  onStop(): void;
}

/** The message box with Send (Stop while a run streams). `components.Composer` replaces it. */
export function Composer({ inputRef, streaming, unavailable, value, onChange, onSend, onStop }: ComposerProps) {
  const ctx = useChatContext();
  const part = usePart();
  const { t } = ctx;
  const hintId = useId();

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (streaming || unavailable || !value.trim()) return;
    if (onSend(value)) onChange("");
  }

  const Custom = ctx.components.Composer;
  if (Custom) {
    return (
      <Custom
        {...slotProps(ctx, "composer", "wa-chat__composer")}
        value={value}
        setValue={onChange}
        send={() => submit()}
        stop={onStop}
        busy={streaming}
        unavailable={unavailable}
        inputRef={inputRef}
      />
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline; never while an IME is composing.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  }

  return (
    <form {...part("composer", "wa-chat__composer")} data-busy={streaming || undefined} onSubmit={submit}>
      {unavailable && (
        <p id={hintId} {...part("status", "wa-chat__offline")}>
          {unavailable}
        </p>
      )}
      <div {...part("field", "wa-chat__field")}>
        <textarea
          {...part("input")}
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("composer.placeholder")}
          aria-label={t("composer.label")}
          aria-describedby={unavailable ? hintId : undefined}
          disabled={!!unavailable}
        />
        {streaming ? (
          <button type="button" {...part("stop", "wa-chat__send")} onClick={onStop} aria-label={t("composer.stop")}>
            <Icon name="stop" />
          </button>
        ) : (
          <button
            type="submit"
            {...part("send", "wa-chat__send")}
            aria-label={t("composer.send")}
            disabled={!!unavailable || !value.trim()}
          >
            <Icon name="send" />
          </button>
        )}
      </div>
    </form>
  );
}
