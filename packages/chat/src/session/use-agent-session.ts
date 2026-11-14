/**
 * A conversation with an agent about this page: the adapter runs the model
 * loop, the page's tools run through `callModelContextTool` (cursor and all),
 * and core agent events mark a call that's waiting for the person to confirm.
 * The conversation survives route changes and reloads (sessionStorage).
 *
 * With a WebAgent (`defineWebAgent`), the model sees only the agent's tools, plus one `delegate_to_<id>` tool per
 * sub-agent. A delegate call runs the sub-agent's own loop on the same adapter, right here: its page tools still run
 * under the cursor, and its stream is kept nested under the call, so the chat can show it.
 */
import { onAgentEvent, whenModelContext } from "@webmcp-agents/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { selectTools, type WebAgent } from "../agent";
import { newId } from "../shared";
import { listToolDescriptors } from "../tools";
import type { AdapterStatus, AgentAdapter, AgentMessage, ToolDescriptor } from "../types";
import { useAdapterStatus } from "./use-adapter-status";
import {
  allToolParts,
  initialSession,
  resumable,
  type SessionError,
  type SessionState,
  sessionReducer,
  userMessage,
} from "./reducer";
import {
  bindRestoreJournal,
  doneToolsAfter,
  messageText,
  RestoreJournal,
  type RestoreResult,
  reverseToolCalls,
} from "./restore-journal";
import { pagePath, runAgent, toolsSettled } from "./run-agent";

/** Options for `useAgentSession`. */
export interface UseAgentSessionOptions {
  /** sessionStorage key for the conversation; `false` keeps it in memory only. Default "web-agents:chat". */
  storageKey?: string | false;
  /** The agent for this page (`defineWebAgent`): its tool subset, instructions and sub-agents. Default: every page tool, no instructions. */
  agent?: WebAgent;
}

/** A live conversation: state plus the actions a chat UI needs. */
export interface AgentSession {
  messages: AgentMessage[];
  status: SessionState["status"];
  error?: SessionError;
  /** The tools the model sees right now: the page's tools through the agent's filter, plus its delegate tools. */
  tools: ToolDescriptor[];
  adapterStatus: AdapterStatus;
  /** The agent in use, when one was set. */
  agent?: WebAgent;
  send(text: string): void;
  stop(): void;
  /** Run the interrupted turn again from its last finished tool call (see `resumable`): nothing is done twice. */
  retry(): void;
  /**
   * Cursor-like restore: stop the run, reverse completed tools after this user message (fills + optional
   * `revert`), drop that turn and everything after it, and return the dropped text for the composer.
   */
  restore(messageId: string): Promise<RestoreResult | undefined>;
  /** Start a new conversation. */
  reset(): void;
}

const MAX_STORED = 60;

function load(key: string | false): SessionState {
  if (!key || typeof sessionStorage === "undefined") return initialSession;
  try {
    const messages = JSON.parse(sessionStorage.getItem(key) ?? "[]") as AgentMessage[];
    // a reload ended any call that was running: show it as cancelled
    return Array.isArray(messages) ? sessionReducer({ messages, status: "idle" }, { type: "stop" }) : initialSession;
  } catch {
    return initialSession;
  }
}

/** A conversation with `adapter` about this page (what <AgentChat> renders; use it to build your own chat UI). */
export function useAgentSession(
  adapter: AgentAdapter,
  { storageKey = "web-agents:chat", agent }: UseAgentSessionOptions = {},
): AgentSession {
  const [state, dispatch] = useReducer(sessionReducer, storageKey, load);
  const latest = useRef(state);
  latest.current = state;

  // ---------- persistence ----------
  useEffect(() => {
    if (!storageKey) return;
    // A conversation interrupted by a reload has no live tool calls: store finished messages only.
    sessionStorage.setItem(storageKey, JSON.stringify(state.messages.slice(-MAX_STORED)));
  }, [state.messages, storageKey]);

  // ---------- the page's tools ----------
  const [pageTools, setPageTools] = useState<ToolDescriptor[]>([]);
  const toolsRef = useRef(pageTools);
  const refreshTools = useCallback(async (): Promise<ToolDescriptor[]> => {
    const next = await listToolDescriptors().catch(() => []);
    toolsRef.current = next;
    setPageTools(next);
    return next;
  }, []);
  useEffect(() => {
    const listening = new AbortController();
    // Once the page has document.modelContext: the provider may still be loading the polyfill.
    const stopWaiting = whenModelContext((mc) => {
      void refreshTools();
      mc.addEventListener("toolchange", () => void refreshTools(), { signal: listening.signal });
    });
    return () => {
      stopWaiting();
      listening.abort();
    };
  }, [refreshTools]);

  // ---------- adapter status ----------
  const adapterStatus = useAdapterStatus(adapter);

  // ---------- confirmation parking, from the agent cursor ----------
  useEffect(
    () =>
      onAgentEvent((e) => {
        if (latest.current.status !== "streaming") return;
        if (e.type === "park") dispatch({ type: "toolPhase", name: e.tool, state: "awaiting-confirmation", prompt: e.prompt });
        else if (e.type === "start") dispatch({ type: "toolPhase", name: e.tool, state: "running" });
      }),
    [],
  );

  // ---------- fill journal (chat restore) ----------
  const journal = useRef(new RestoreJournal());
  useEffect(() => bindRestoreJournal(journal.current), []);

  // ---------- runs ----------
  const controller = useRef<AbortController | null>(null);
  /** Counts runs, so a run that ended only stamps the page while no newer run has started. */
  const runs = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (messages: AgentMessage[]) => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const runId = ++runs.current;
      try {
        // the loop is shared with `agent.invoke` and `useWebAgent` (./run-agent); this session renders its parts
        await runAgent({
          adapter,
          agent,
          messages,
          signal: ctrl.signal,
          listTools: refreshTools,
          onPart: (part, within) => {
            if (controller.current !== ctrl) return;
            if (part.type === "tool-call") journal.current.beginCall(part.id, part.name);
            else if (part.type === "tool-result" || part.type === "tool-error") {
              const name = allToolParts(latest.current.messages).find((p) => p.id === part.id)?.name;
              if (name) journal.current.endCall(part.id, name);
            }
            dispatch({ type: "part", part, within });
          },
        });
      } finally {
        if (controller.current === ctrl) controller.current = null;
      }
      // Where this run left the page, once a navigation its last call started has landed: the next message is
      // compared with it (`withPageMoves`). A newer run (or a reset) owns the conversation by then: leave it be.
      await toolsSettled();
      if (runs.current === runId) dispatch({ type: "ended", page: pagePath() });
    },
    [adapter, agent, refreshTools],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || latest.current.status === "streaming") return;
      const id = newId("u");
      const page = pagePath();
      dispatch({ type: "send", id, text: trimmed, page });
      void run([...latest.current.messages, userMessage(id, trimmed, page)]);
    },
    [run],
  );

  // Retry continues the interrupted turn from its last finished tool call (see `resumable`): nothing is done twice.
  const retry = useCallback(() => {
    const { messages, status } = latest.current;
    if (!messages.some((m) => m.role === "user") || status === "streaming") return;
    dispatch({ type: "retry" });
    void run(resumable(messages));
  }, [run]);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    dispatch({ type: "stop" });
  }, []);

  const restore = useCallback(
    async (messageId: string): Promise<RestoreResult | undefined> => {
      const { messages } = latest.current;
      const target = messages.find((m) => m.id === messageId && m.role === "user");
      if (!target) return undefined;
      const idx = messages.indexOf(target);
      // already the empty suffix (nothing at or after this checkpoint to drop)
      if (idx === -1) return undefined;

      stop();

      const done = doneToolsAfter(messages, messageId);
      const { reverted, skipped } = await reverseToolCalls(done, journal.current);
      journal.current.forget(allToolParts(messages.slice(idx)).map((p) => p.id));

      dispatch({ type: "restore", beforeId: messageId });
      return { restoredText: messageText(target), reverted, skipped };
    },
    [stop],
  );

  const reset = useCallback(() => {
    stop();
    journal.current.clear();
    dispatch({ type: "reset" });
  }, [stop]);

  return {
    messages: state.messages,
    status: state.status,
    error: state.error,
    tools: selectTools(agent, pageTools),
    adapterStatus,
    agent,
    send,
    stop,
    retry,
    restore,
    reset,
  };
}
