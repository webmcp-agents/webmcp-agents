import { slotProps, useChatContext, usePart } from "../customize/context";
import { en } from "../customize/en";
import type { ToolDescriptor } from "../types";

const MAX = 48;

/**
 * Up to three prompts from the page's tools (their description's first sentence), plus a general one (`fallback`,
 * the catalog's `suggestions.fallback`; English by default).
 */
export function suggestionsFor(tools: readonly ToolDescriptor[], fallback: string = en.suggestions.fallback): string[] {
  const picks: string[] = [];
  for (const t of tools) {
    const sentence = t.description
      .split(/(?<=[.!?])\s/)[0]
      ?.replace(/[.!?]$/, "")
      .trim();
    if (sentence && sentence.length <= MAX && !picks.includes(sentence)) picks.push(sentence);
    if (picks.length === 3) break;
  }
  return fallback ? [...picks, fallback] : picks;
}

/** Starter prompts: a labelled list of buttons. `components.Suggestions` replaces it. */
export function Suggestions({ items, onPick }: { items: readonly string[]; onPick(text: string): void }) {
  const ctx = useChatContext();
  const part = usePart();
  const Custom = ctx.components.Suggestions;
  if (Custom) return <Custom {...slotProps(ctx, "suggestions", "wa-chat__suggestions")} items={items} pick={onPick} />;
  return (
    <ul {...part("suggestions", "wa-chat__suggestions")} aria-label={ctx.t("suggestions.label")}>
      {items.map((s) => (
        <li key={s} {...part("suggestionItem")}>
          <button type="button" {...part("suggestion")} onClick={() => onPick(s)}>
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}
