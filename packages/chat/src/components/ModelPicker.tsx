import { useId } from "react";
import { slotProps, useChatContext, usePart } from "../customize/context";
import type { ModelChoice } from "../types";

/** Props of the model picker. */
export interface ModelPickerProps {
  models: readonly ModelChoice[];
  /** No switching mid-reply or mid-download. */
  disabled: boolean;
  onSelect(id: string): void;
}

/**
 * Which model an adapter runs (shown when it offers more than one): a native select, with the chosen model's brief,
 * size and whether it is already on this device underneath. `components.ModelPicker` replaces it.
 */
export function ModelPicker({ models, disabled, onSelect }: ModelPickerProps) {
  const ctx = useChatContext();
  const part = usePart();
  const { t } = ctx;
  const id = useId();
  const Custom = ctx.components.ModelPicker;
  if (Custom) return <Custom {...slotProps(ctx, "modelPicker", "wa-chat__model")} models={models} select={onSelect} disabled={disabled} />;
  const current = models.find((m) => m.selected) ?? models[0];
  if (!current) return null;
  const size = (bytes: number): string => t("model.size", { bytes, formatted: t.format.bytes(bytes) });
  const meta = [
    current.brief,
    current.bytes
      ? current.cached
        ? t("model.sizeCached", { size: size(current.bytes) })
        : t("model.sizeDownload", { size: size(current.bytes) })
      : current.cached
        ? t("model.onDevice")
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const option = (m: ModelChoice): string => {
    let label = m.label;
    if (m.recommended) label = t("model.recommended", { model: label });
    if (m.cached) label = t("model.cached", { model: label });
    return label;
  };
  return (
    <div {...part("modelPicker", "wa-chat__model")}>
      <label {...part("modelLabel")} htmlFor={id}>
        {t("model.label")}
      </label>
      <select
        {...part("modelSelect")}
        id={id}
        value={current.id}
        disabled={disabled}
        aria-describedby={`${id}-meta`}
        onChange={(e) => onSelect(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.id} {...part("modelOption")} value={m.id}>
            {option(m)}
          </option>
        ))}
      </select>
      <p id={`${id}-meta`} {...part("modelMeta", "wa-chat__model-meta")}>
        {meta}
      </p>
    </div>
  );
}
