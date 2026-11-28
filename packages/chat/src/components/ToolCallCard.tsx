import { outputText } from "../adapter/wire";
import { DELEGATE_PREFIX, isDelegateTool, type WebAgentStep } from "../agent";
import { slotProps, useChatContext, usePart } from "../customize/context";
import type { MessageKey } from "../customize/types";
import { redactToolCall } from "../redact";
import type { AgentMessage, AgentPart } from "../types";
import { Text } from "./Text";

type ToolPart = Extract<AgentPart, { type: "tool" }>;

/** A call's state: the catalog key of its chip, and the `data-status` value 0.4.0 selectors match. */
const STATUS: Record<ToolPart["state"], { key: MessageKey; data: string }> = {
  running: { key: "tool.running", data: "running" },
  "awaiting-confirmation": { key: "tool.awaitingConfirmation", data: "awaiting" },
  done: { key: "tool.done", data: "done" },
  error: { key: "tool.failed", data: "error" },
  cancelled: { key: "tool.cancelled", data: "cancelled" },
};

/**
 * A sub-agent's answer as its nested run shows it: the text of its last reply, whitespace collapsed ("" when that reply
 * has no text, so the tool's output is the only place the answer is shown).
 */
export function delegateAnswer(part: ToolPart): string {
  const last = part.agent?.messages.filter((m) => m.role === "assistant").at(-1);
  return (last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n") ?? "").replace(/\s+/g, " ").trim();
}

/** `add_to_cart` → "Add to cart": a tool's id read as words (the page's own naming, not catalog text). */
export const toolLabel = (name: string): string => {
  const words = name.replace(/[_.-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** `qty: 2, variant: M` — the call's arguments in one short line. */
function summarize(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const text = Object.entries(input as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
  return text.length > 90 ? `${text.slice(0, 89)}…` : text;
}

/** Bring the tool's element (or the button the browser paused on) into view. */
function showOnPage(name: string): void {
  const el =
    document.querySelector(`[toolname="${CSS.escape(name)}"] [data-tool-submit-active]`) ??
    document.querySelector(`[toolname="${CSS.escape(name)}"]`);
  el?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/** A sub-agent's run, nested under its delegate call: its replies and its own tool cards. */
function NestedRun({ messages }: { messages: AgentMessage[] }) {
  const part = usePart();
  const visible = messages.flatMap((m) => m.parts.filter((p) => p.type === "tool" || (p.type === "text" && p.text.trim())));
  if (visible.length === 0) return null;
  return (
    <div {...part("subagent", "wa-chat__nested")}>
      {visible.map((p, i) =>
        p.type === "tool" ? (
          <ToolCallCard key={p.id} part={p} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a run's parts only grow at the end
          <div key={i} {...part("bubble", "wa-chat__bubble")}>
            <Text text={p.type === "text" ? p.text : ""} />
          </div>
        ),
      )}
    </div>
  );
}

/** The step a custom `ToolCard` gets: the call as `agent.invoke` reports it (already redacted). */
const toStep = (p: ToolPart): WebAgentStep => ({
  id: p.id,
  tool: p.name,
  input: p.input,
  state: p.state,
  ...(p.output && { output: p.output }),
  ...(p.error !== undefined && { error: p.error }),
  ...(p.prompt !== undefined && { prompt: p.prompt }),
  ...(p.agent && { agent: p.agent.id }),
});

/** One tool call: its name, state, arguments, prompt while parked, result, and a sub-agent's nested run. */
export function ToolCallCard({ part: sent }: { part: ToolPart }) {
  const ctx = useChatContext();
  const part = usePart();
  const { t } = ctx;
  // shown to the person: through the page's redactor, the tool's `sensitive` fields masked (design §8.3 row 3)
  const shown = redactToolCall({ name: sent.name, input: sent.input, output: sent.output, error: sent.error });
  const call = { ...sent, input: shown.input, output: shown.output, error: shown.error } as ToolPart;
  const status = STATUS[call.state];
  const delegate = isDelegateTool(call.name);
  const name = delegate ? t("tool.agent", { agent: toolLabel(call.name.slice(DELEGATE_PREFIX.length)) }) : toolLabel(call.name);
  const nested = call.agent ? <NestedRun messages={call.agent.messages} /> : undefined;
  const state = {
    "data-state": call.state,
    "data-status": status.data,
    "data-agent": delegate || undefined,
  };

  const Custom = ctx.components.ToolCard;
  if (Custom) {
    const props = slotProps(ctx, "toolCard", "wa-chat__tool", nested);
    return <Custom {...props} partProps={{ ...props.partProps, ...state }} call={toStep(call)} part={sent} />;
  }

  const task = delegate && call.input && typeof call.input === "object" ? (call.input as { task?: unknown }).task : undefined;
  const args = delegate ? (typeof task === "string" ? task : "") : summarize(call.input);
  // A sub-agent's answer is its last reply, already shown in its nested run: the card doesn't print it twice.
  const answered = !!delegateAnswer(call);
  const result =
    call.state === "done" ? (answered ? "" : outputText(call.output)) : call.state === "error" ? call.error || outputText(call.output) : "";
  return (
    <div {...part("toolCard", "wa-chat__tool")} {...state}>
      <div {...part("toolHead", "wa-chat__tool-head")}>
        <span {...part("toolName", "wa-chat__tool-name")}>{name}</span>
        <span {...part("toolState", "wa-chat__chip")} data-state={call.state}>
          {t(status.key, { tool: name })}
        </span>
      </div>
      {args && <p {...part("toolInput", "wa-chat__tool-args")}>{args}</p>}
      {nested}
      {call.state === "awaiting-confirmation" && (
        <div {...part("toolPrompt", "wa-chat__confirm")}>
          <p {...part("toolPromptText")}>{call.prompt ?? t("tool.confirmOnPage")}</p>
          <button type="button" {...part("showOnPage", "wa-chat__link")} onClick={() => showOnPage(call.name)}>
            {t("tool.showOnPage")}
          </button>
        </div>
      )}
      {result && (
        <p {...part("toolOutput", "wa-chat__tool-result")} data-clamp={result.length > 140 || undefined}>
          {result.replace(/^Error(?: \[[a-z_]+\])?:\s*/, "")}
        </p>
      )}
    </div>
  );
}
