import type { KeyboardEvent } from "react";
import { useChatContext, usePart } from "../customize/context";
import type { Translate } from "../customize/types";
import { useAdapterStatus } from "../session/use-adapter-status";
import type { AdapterStatus, AgentAdapter } from "../types";

const DOT: Record<AdapterStatus["state"], string> = {
  ready: "ready",
  loading: "pending",
  "needs-download": "pending",
  downloading: "pending",
  unavailable: "off",
  error: "off",
};

/**
 * An adapter's name in the page's language: a built-in adapter describes itself (`AgentAdapter.labelParts`) and is
 * worded from the catalog; any other shows its own `label`.
 */
export function adapterLabel(adapter: AgentAdapter, t: Translate): string {
  const parts = adapter.labelParts;
  if (!parts) return adapter.label;
  if (parts.kind === "on-device") return parts.model ?? t("adapter.onDevice");
  return parts.model ? t("adapter.cloudNamed", { model: parts.model }) : t("adapter.cloud");
}

/** Why an adapter cannot run, in the page's language when it gave a code. */
export function unavailableReason(status: Extract<AdapterStatus, { state: "unavailable" }>, t: Translate): string {
  if (status.code) return t(`errors.${status.code}`);
  return status.reason || t("adapter.unavailable");
}

function Option({
  adapter,
  selected,
  disabled,
  onSelect,
}: {
  adapter: AgentAdapter;
  selected: boolean;
  disabled: boolean;
  onSelect(): void;
}) {
  const { t } = useChatContext();
  const part = usePart();
  const status = useAdapterStatus(adapter);
  const off = status.state === "unavailable";
  return (
    // biome-ignore lint/a11y/useSemanticElements: a segmented control; the radio group's arrow keys are handled by the group
    <button
      type="button"
      {...part("adapterOption", "wa-chat__switch")}
      role="radio"
      aria-checked={selected}
      data-state={DOT[status.state]}
      tabIndex={selected ? 0 : -1}
      disabled={disabled || (off && !selected)}
      title={off ? unavailableReason(status, t) : undefined}
      onClick={onSelect}
    >
      <span {...part("adapterDot", "wa-chat__dot")} data-state={DOT[status.state]} aria-hidden="true" />
      {adapterLabel(adapter, t)}
    </button>
  );
}

/** Which assistant answers: a segmented radio group (arrow keys move between options, mirrored in RTL). */
export function AdapterSwitcher({
  adapters,
  value,
  disabled,
  onChange,
}: {
  adapters: readonly AgentAdapter[];
  value: string;
  disabled: boolean;
  onChange(id: string): void;
}) {
  const { t, dir } = useChatContext();
  const part = usePart();
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    // the next option that can be chosen: unavailable assistants are skipped, as they are for the mouse
    const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const rtl = dir === "rtl";
    const back = e.key === "ArrowUp" || (e.key === "ArrowLeft" && !rtl) || (e.key === "ArrowRight" && rtl);
    const step = back ? -1 : 1;
    const at = adapters.findIndex((a) => a.id === value);
    for (let i = 1; i < radios.length; i++) {
      const next = (at + step * i + radios.length) % radios.length;
      if (radios[next]?.disabled) continue;
      onChange(adapters[next]!.id);
      radios[next]!.focus();
      return;
    }
  }
  return (
    <div
      {...part("adapterSwitcher", "wa-chat__switcher")}
      role="radiogroup"
      aria-label={t("adapter.label")}
      data-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
    >
      {adapters.map((a) => (
        <Option key={a.id} adapter={a} selected={a.id === value} disabled={disabled} onSelect={() => onChange(a.id)} />
      ))}
    </div>
  );
}
