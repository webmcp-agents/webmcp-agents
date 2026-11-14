import { outputText } from "../adapter/wire";
import { DELEGATE_PREFIX, isDelegateTool } from "../agent";
import type { AgentMessage, AgentPart } from "../types";
import { Text } from "./Text";

type ToolPart = Extract<AgentPart, { type: "tool" }>;

const STATUS: Record<ToolPart["state"], { label: string; data: string }> = {
  running: { label: "Working", data: "running" },
  "awaiting-confirmation": { label: "Waiting for you", data: "awaiting" },
  done: { label: "Done", data: "done" },
  error: { label: "Failed", data: "error" },
  cancelled: { label: "Cancelled", data: "cancelled" },
};

/** `add_to_cart` → "Add to cart". */
/**
 * A sub-agent's answer as its nested run shows it: the text of its last reply, whitespace collapsed ("" when that reply
 * has no text, so the tool's output is the only place the answer is shown).
 */
export function delegateAnswer(part: ToolPart): string {
  const last = part.agent?.messages.filter((m) => m.role === "assistant").at(-1);
  return (last?.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n") ?? "").replace(/\s+/g, " ").trim();
}

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
  const visible = messages.flatMap((m) => m.parts.filter((p) => p.type === "tool" || (p.type === "text" && p.text.trim())));
  if (visible.length === 0) return null;
  return (
    <div className="wa-chat__nested">
      {visible.map((p, i) =>
        p.type === "tool" ? (
          <ToolCallCard key={p.id} part={p} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: a run's parts only grow at the end
          <div key={i} className="wa-chat__bubble">
            <Text text={p.type === "text" ? p.text : ""} />
          </div>
        ),
      )}
    </div>
  );
}

/** `delegate_to_checkout` → "Checkout agent"; the task is the line under it. */
const delegateLabel = (name: string): string => `${toolLabel(name.slice(DELEGATE_PREFIX.length))} agent`;

export function ToolCallCard({ part }: { part: ToolPart }) {
  const status = STATUS[part.state];
  const delegate = isDelegateTool(part.name);
  const task = delegate && part.input && typeof part.input === "object" ? (part.input as { task?: unknown }).task : undefined;
  const args = delegate ? (typeof task === "string" ? task : "") : summarize(part.input);
  // A sub-agent's answer is its last reply, already shown in its nested run: the card doesn't print it twice.
  const answered = !!delegateAnswer(part);
  const result =
    part.state === "done" ? (answered ? "" : outputText(part.output)) : part.state === "error" ? part.error || outputText(part.output) : "";
  return (
    <div className="wa-chat__tool" data-status={status.data} data-agent={delegate || undefined}>
      <div className="wa-chat__tool-head">
        <span className="wa-chat__tool-name">{delegate ? delegateLabel(part.name) : toolLabel(part.name)}</span>
        <span className="wa-chat__chip">{status.label}</span>
      </div>
      {args && <p className="wa-chat__tool-args">{args}</p>}
      {part.agent && <NestedRun messages={part.agent.messages} />}
      {part.state === "awaiting-confirmation" && (
        <div className="wa-chat__confirm">
          <p>{part.prompt ?? "Confirm on the page to continue."}</p>
          <button type="button" className="wa-chat__link" onClick={() => showOnPage(part.name)}>
            Show me
          </button>
        </div>
      )}
      {result && (
        <p className="wa-chat__tool-result" data-clamp={result.length > 140 || undefined}>
          {result.replace(/^Error(?: \[[a-z_]+\])?:\s*/, "")}
        </p>
      )}
    </div>
  );
}
