/**
 * The wire between the chat's own message shape and AI SDK's UI message
 * stream protocol. Pure: no DOM, so the server handler imports it too.
 *
 *   toUIMessages(history)        AgentMessage[] → UIMessage[] (the server feeds them to convertToModelMessages)
 *   readParts(body, messageId)   an SSE response body → AgentStreamPart[] as they arrive
 */
import type { UIMessage, UIMessageChunk } from "ai";
import { CANCELLED } from "../shared";
import type { StepUsage } from "../session/run-events";
import type { AgentMessage, AgentPart, AgentStreamPart, ToolOutput } from "../types";

/** Longest tool text sent back to the model; the rest is cut with a marker. */
export const MAX_TOOL_TEXT = 4000;

/** The tool's result as the model will read it, with long text truncated. */
export function toolOutputForModel(output: ToolOutput): ToolOutput {
  return {
    ...output,
    content: output.content.map((c) =>
      c.type === "text" && c.text && c.text.length > MAX_TOOL_TEXT ? { ...c, text: `${c.text.slice(0, MAX_TOOL_TEXT)}…(truncated)` } : c,
    ),
  };
}

/** The text of a tool result, for cards and error messages. */
export const outputText = (output: ToolOutput | undefined): string =>
  (output?.content ?? []).map((c) => (c.type === "text" ? c.text : "")).join("\n");

type UIPart = UIMessage["parts"][number];

/** Options for `toUIMessages`. */
export interface ToUIMessagesOptions {
  /**
   * For rendering rather than for the model: open calls stay `input-available` (the model side marks them
   * interrupted), text and reasoning carry a `state`, and messages left empty are kept. Default false.
   */
  forRendering?: boolean;
  /** With `forRendering`: the run is still streaming, so the last text / reasoning part is `streaming`. */
  streaming?: boolean;
}

function toUIPart(part: AgentPart, opts: ToUIMessagesOptions, last: boolean): UIPart | null {
  const state = opts.forRendering ? (opts.streaming && last ? "streaming" : "done") : undefined;
  if (part.type === "text") return part.text || opts.forRendering ? { type: "text", text: part.text, ...(state && { state }) } : null;
  if (part.type === "reasoning") {
    return { type: "reasoning", text: part.text, providerMetadata: part.providerMetadata as never, ...(state && { state }) };
  }
  const base = {
    type: "dynamic-tool" as const,
    toolName: part.name,
    toolCallId: part.id,
    input: part.input ?? {},
    // Gemini's thought signatures and OpenAI's item ids ride on the call, like Claude's on its reasoning
    ...(part.providerMetadata && { callProviderMetadata: part.providerMetadata as never }),
  };
  if (part.state === "done" && part.output) return { ...base, state: "output-available", output: toolOutputForModel(part.output) };
  if (opts.forRendering && (part.state === "running" || part.state === "awaiting-confirmation"))
    return { ...base, state: "input-available" };
  const errorText =
    part.state === "cancelled"
      ? CANCELLED
      : part.state === "error"
        ? part.error || outputText(part.output) || "The tool failed."
        : "Error [interrupted]: The tool didn't finish (the conversation was interrupted). Check the page before trying again.";
  return { ...base, state: "output-error", errorText };
}

/**
 * The conversation as AI SDK UI messages: for `convertToModelMessages` by default (messages left empty, a reply stopped
 * before it began, are skipped), or for rendering with `forRendering` (see `useAgentChat`).
 */
export function toUIMessages(messages: readonly AgentMessage[], opts: ToUIMessagesOptions = {}): UIMessage[] {
  const out = messages.map((m, i) => ({
    id: m.id,
    role: m.role,
    parts: m.parts
      .map((p, j) => toUIPart(p, opts, i === messages.length - 1 && j === m.parts.length - 1))
      .filter((p): p is UIPart => p !== null),
  }));
  return opts.forRendering ? out : out.filter((m) => m.parts.length > 0);
}

/** Split a server-sent-events body into the JSON chunks of the UI message stream. */
async function* sseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<UIMessageChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
        const data = event
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        yield JSON.parse(data) as UIMessageChunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** What the server reports about a step in the stream's message metadata (`createChatHandler({ telemetry })`). */
export interface StepMetadata {
  usage?: StepUsage;
  /** The model id the server ran, e.g. "anthropic/claude-opus-5-5". */
  model?: string;
}

const USAGE_KEYS = ["inputTokens", "outputTokens", "reasoningTokens", "cachedInputTokens", "totalTokens"] as const;

/**
 * The step metadata in a chunk's `messageMetadata`, checked: only finite, non-negative token counts and a short model
 * id pass (the stream comes from a server, but a proxy or an old one may send anything). Undefined when there is none.
 */
export function readStepMetadata(value: unknown): StepMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { usage, model } = value as { usage?: unknown; model?: unknown };
  const out: StepMetadata = {};
  if (usage && typeof usage === "object") {
    const counts: StepUsage = {};
    for (const key of USAGE_KEYS) {
      const n = (usage as Record<string, unknown>)[key];
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) counts[key] = n;
    }
    if (Object.keys(counts).length) out.usage = counts;
  }
  if (typeof model === "string" && model.length > 0 && model.length <= 200) out.model = model;
  return out.usage || out.model ? out : undefined;
}

/**
 * Turn a UI message stream response into stream parts for the assistant
 * message `messageId`. Text arrives as deltas; each tool call once its input
 * is complete; signed reasoning once it ends (to be sent back next request).
 * `onMetadata`: the step's usage and model, when the server sends them (in the `finish` chunk's `messageMetadata`,
 * or a `message-metadata` chunk); a server that sends none (0.4.0) never calls it.
 */
export async function* readParts(
  body: ReadableStream<Uint8Array>,
  messageId: string,
  onMetadata?: (metadata: StepMetadata) => void,
): AsyncGenerator<AgentStreamPart> {
  const reasoning = new Map<string, { text: string; providerMetadata?: Record<string, Record<string, unknown>> }>();
  for await (const chunk of sseChunks(body)) {
    switch (chunk.type) {
      case "start":
      case "finish":
      case "message-metadata": {
        const metadata = onMetadata && readStepMetadata(chunk.messageMetadata);
        if (metadata) onMetadata?.(metadata);
        break;
      }
      case "text-delta":
        if (chunk.delta) yield { type: "text-delta", messageId, delta: chunk.delta };
        break;
      case "reasoning-start":
        reasoning.set(chunk.id, { text: "", providerMetadata: chunk.providerMetadata as never });
        break;
      case "reasoning-delta": {
        const r = reasoning.get(chunk.id);
        if (r) r.text += chunk.delta;
        break;
      }
      case "reasoning-end": {
        const r = reasoning.get(chunk.id);
        reasoning.delete(chunk.id);
        // The signature arrives on the end chunk.
        const providerMetadata = (chunk.providerMetadata ?? r?.providerMetadata) as never;
        yield { type: "reasoning", messageId, text: r?.text ?? "", providerMetadata };
        break;
      }
      case "tool-input-available":
        if (!chunk.providerExecuted) {
          yield {
            type: "tool-call",
            messageId,
            id: chunk.toolCallId,
            name: chunk.toolName,
            input: chunk.input,
            providerMetadata: chunk.providerMetadata as never,
          };
        }
        break;
      case "tool-input-error":
        // The model produced input that doesn't parse: it's still a call the model expects an answer to.
        yield { type: "tool-call", messageId, id: chunk.toolCallId, name: chunk.toolName, input: chunk.input };
        yield {
          type: "tool-error",
          id: chunk.toolCallId,
          error: chunk.errorText.startsWith("Error") ? chunk.errorText : `Error [invalid_input]: ${chunk.errorText}`,
        };
        break;
      case "error":
        yield { type: "error", error: chunk.errorText };
        break;
    }
  }
}
