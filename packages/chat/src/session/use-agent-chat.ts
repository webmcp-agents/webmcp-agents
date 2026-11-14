/**
 * `useAgentChat`: the chat as a `useChat`-shaped API, so a page can render it with its own components (shadcn/ui's AI
 * patterns, or anything that reads AI SDK `UIMessage`s). It owns what `<AgentChat>` owns: the adapter choice (and its
 * memory), the session, the adapter's status and models, the suggestions. `<AgentChat>` is built on it.
 *
 * The messages are canonical AI SDK `UIMessage`s. What web-agents adds (a tool parked on the page waiting for the
 * person's click, a sub-agent's nested run) is read with `toolPhase(part)`, so the message shape stays what every AI
 * component expects.
 */
import { useCallback, useMemo, useState } from "react";
import { getDefaultAdapter } from "../adapter/cloud";
import { toUIMessages } from "../adapter/wire";
import type { WebAgent } from "../agent";
import { suggestionsFor } from "../components/Suggestions";
import type { AdapterStatus, AgentAdapter, AgentMessage, AgentPart, ModelChoice, ToolDescriptor } from "../types";
import type { SessionError } from "./reducer";
import type { RestoreResult } from "./restore-journal";
import type { ChatRestoreSnapshots } from "./restore-snapshot";
import { type AgentSession, useAgentSession } from "./use-agent-session";
import type { UIMessage } from "ai";

const ADAPTER_KEY = "web-agents:chat:adapter";

/** Options for `useAgentChat`. */
export interface UseAgentChatOptions extends ChatRestoreSnapshots {
  /** One agent adapter. Default: one shared `createCloudAdapter()` (your `/api/chat`), when `adapters` is not given either. */
  adapter?: AgentAdapter;
  /** Several adapters (cloud, on-device…); the person's choice is remembered in localStorage. The first is the default. */
  adapters?: readonly AgentAdapter[];
  /** The page's agent (`defineWebAgent`). */
  agent?: WebAgent;
  /** sessionStorage key for the conversation; `false` keeps it in memory. Default "web-agents:chat". */
  storageKey?: string | false;
}

/** Where a tool call is, in web-agents terms, for a part that `UIMessage` can't express on its own. */
export interface ToolPhase {
  phase: "running" | "parked" | "done" | "error" | "cancelled";
  /** While parked: what the person should click on the page. */
  prompt?: string;
  /** A sub-agent's nested run behind a `delegate_to_<id>` call: its id and its messages as `UIMessage`s. */
  agent?: { id: string; messages: UIMessage[] };
}

/** The chat, `useChat`-shaped. */
export interface AgentChat {
  /** The conversation as AI SDK UI messages: text, reasoning, `dynamic-tool` parts. */
  messages: UIMessage[];
  /** AI SDK `ChatStatus` names: `submitted` while the first part is awaited, `streaming`, `ready`, `error`. */
  status: "submitted" | "streaming" | "ready" | "error";
  error?: SessionError;
  sendMessage(input: { text: string }): void;
  stop(): void;
  /** Retry: resume the interrupted turn from its last finished tool call (nothing is done twice). */
  regenerate(): void;
  /** Start a new conversation. */
  clear(): void;
  /**
   * Restore to before the user message `messageId`: stop, reverse completed tools in the dropped
   * span, reapply that turn's URL / optional app snapshot, truncate the thread, return the dropped
   * text for the composer.
   */
  restore(messageId: string): Promise<RestoreResult | undefined>;
  /** The tools the model sees right now. */
  tools: ToolDescriptor[];
  /** Starter prompts, from the page's tools. */
  suggestions: string[];
  adapters: readonly AgentAdapter[];
  adapter: AgentAdapter;
  selectAdapter(id: string): void;
  adapterStatus: AdapterStatus;
  /** The adapter's models, when it offers several (`AgentAdapter.models`). */
  models: readonly ModelChoice[];
  selectModel?(id: string): Promise<void>;
  /** Start the adapter's opt-in setup (a model download); aborting `signal` cancels it. Absent when the adapter needs none. */
  prepare?(signal?: AbortSignal): Promise<void>;
  agent?: WebAgent;
  /** The web-agents state of a tool part: parked on the page, cancelled, a nested sub-agent run. */
  toolPhase(part: UIMessage["parts"][number]): ToolPhase | undefined;
  /** The underlying session, for UIs that render the chat's own message shape (what `<AgentChat>` does). */
  session: AgentSession;
}

const readChoice = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

type ToolPart = Extract<AgentPart, { type: "tool" }>;

/** Every tool part of the session's messages, nested runs included, by call id. */
function indexToolParts(messages: readonly AgentMessage[], into = new Map<string, ToolPart>()): Map<string, ToolPart> {
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type !== "tool") continue;
      into.set(p.id, p);
      if (p.agent) indexToolParts(p.agent.messages, into);
    }
  }
  return into;
}

/** A conversation with one of `adapters` about this page, as AI SDK UI messages (what `<AgentChat>` renders; use it for your own UI). */
export function useAgentChat({
  adapter,
  adapters,
  agent,
  storageKey,
  getSnapshot,
  applySnapshot,
}: UseAgentChatOptions = {}): AgentChat {
  const all = useMemo(() => (adapters?.length ? adapters : [adapter ?? getDefaultAdapter()]), [adapter, adapters]);
  // the person's last choice, when that adapter is still offered
  const [adapterId, setAdapterId] = useState(() => {
    const saved = readChoice(ADAPTER_KEY);
    return all.some((a) => a.id === saved) ? saved! : all[0]!.id;
  });
  const current = all.find((a) => a.id === adapterId) ?? all[0]!;
  const selectAdapter = useCallback((id: string): void => {
    setAdapterId(id);
    try {
      localStorage.setItem(ADAPTER_KEY, id);
    } catch {
      // storage blocked: the choice lasts for this page
    }
  }, []);

  const session = useAgentSession(current, { storageKey, agent, getSnapshot, applySnapshot });
  const streaming = session.status === "streaming";
  const last = session.messages.at(-1);
  // "submitted" until the first part of the reply arrives (the user message is the last one)
  const status = streaming ? (last?.role === "user" ? "submitted" : "streaming") : session.status === "error" ? "error" : "ready";

  const messages = useMemo(() => toUIMessages(session.messages, { forRendering: true, streaming }), [session.messages, streaming]);
  const index = useMemo(() => indexToolParts(session.messages), [session.messages]);
  const toolPhase = useCallback(
    (part: UIMessage["parts"][number]): ToolPhase | undefined => {
      if (part.type !== "dynamic-tool" && !part.type.startsWith("tool-")) return undefined;
      const id = (part as { toolCallId?: string }).toolCallId;
      const own = id ? index.get(id) : undefined;
      if (!own) return undefined;
      const phase: ToolPhase["phase"] =
        own.state === "awaiting-confirmation" ? "parked" : own.state === "running" ? "running" : own.state === "done" ? "done" : own.state;
      return {
        phase,
        prompt: own.state === "awaiting-confirmation" ? own.prompt : undefined,
        agent: own.agent ? { id: own.agent.id, messages: toUIMessages(own.agent.messages, { forRendering: true, streaming }) } : undefined,
      };
    },
    [index, streaming],
  );

  const sendMessage = useCallback((input: { text: string }) => session.send(input.text), [session.send]);
  const suggestions = useMemo(() => suggestionsFor(session.tools), [session.tools]);
  const models = current.models?.() ?? [];

  return {
    messages,
    status,
    error: session.error,
    sendMessage,
    stop: session.stop,
    regenerate: session.retry,
    clear: session.reset,
    restore: session.restore,
    tools: session.tools,
    suggestions,
    adapters: all,
    adapter: current,
    selectAdapter,
    adapterStatus: session.adapterStatus,
    models,
    selectModel: current.selectModel ? (id) => current.selectModel!(id) : undefined,
    prepare: current.prepare ? (signal) => current.prepare!(signal) : undefined,
    agent,
    toolPhase,
    session,
  };
}
