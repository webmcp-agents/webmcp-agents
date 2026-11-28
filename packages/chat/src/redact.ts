/**
 * Redaction in the chat (design §8.3 rows 3, 9, 10): what the tool card shows the person, and the result fields a tool
 * keeps from the model (`sensitive: { output, hideFromModel: true }`).
 */
import { getRegisteredWebTool } from "@webmcp-agents/core";
import { getRedactor, toolSensitivity } from "@webmcp-agents/core/redact";

/** One tool call, as {@link redactToolCall} takes and returns it. Every field is optional. */
export interface ToolCallView<I = unknown, O = unknown> {
  /** The tool's name: its `sensitive` fields are read from the tool registered on the page under it. */
  name: string;
  /** The arguments the agent sent. */
  input?: I;
  /** The result (a WebMCP result, or any value). */
  output?: O;
  /** An error message. */
  error?: string;
}

/**
 * A tool call as a UI shows it to the person: input, output and error through the page's redactor (`configureRedaction`),
 * with the tool's own `sensitive` fields masked. The chat's tool card and the registry's `agent-tool` block use it.
 * Never throws; the call itself (what ran, what the model got) is not changed.
 *
 * @example
 * const { input, output } = redactToolCall({ name: part.toolName, input: part.input, output: part.output });
 */
export function redactToolCall<I, O>(call: ToolCallView<I, O>): ToolCallView<I, O> {
  const redact = getRedactor();
  const marked = toolSensitivity(getRegisteredWebTool(call.name));
  return {
    name: call.name,
    input: call.input === undefined ? undefined : redact(call.input, { kind: "tool-input", tool: call.name, sensitive: marked.input }),
    output: call.output === undefined ? undefined : redact(call.output, { kind: "tool-output", tool: call.name, sensitive: marked.output }),
    error: call.error === undefined ? undefined : redact.text(call.error),
  };
}

/** What a hidden field reads as, for the model. */
const HIDDEN = "[REDACTED]";

/** `value` with every field named in `names` (at any depth, JSON inside strings included) replaced by the token. */
function hide(value: unknown, names: readonly string[], depth = 0): unknown {
  if (depth > 32) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (!/^[[{]/.test(t)) return value;
    try {
      const parsed: unknown = JSON.parse(t);
      const hidden = hide(parsed, names, depth + 1);
      return JSON.stringify(hidden) === JSON.stringify(parsed) ? value : JSON.stringify(hidden); // untouched JSON keeps its form
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((v) => hide(v, names, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, names.includes(k) ? HIDDEN : hide(v, names, depth + 1)]));
}

/**
 * A tool's result as the model receives it (and as the conversation stores it for the next turn): unchanged, unless
 * the tool sets `sensitive: { output: [...], hideFromModel: true }`, whose fields then read as `"[REDACTED]"`, in the
 * result's text (JSON) and its `structuredContent` alike. Only those names change: the model keeps everything else
 * (design §8.3 row 9). The page and the person already have the value. A result that cannot be read reaches the
 * model as the token alone: failing never shows it the hidden fields.
 */
export function hideFromModel<O>(name: string, output: O): O {
  const marked = toolSensitivity(getRegisteredWebTool(name));
  if (!marked.hideFromModel || !marked.output.length) return output;
  try {
    return hide(output, marked.output) as O;
  } catch {
    return { content: [{ type: "text", text: HIDDEN }] } as O;
  }
}
