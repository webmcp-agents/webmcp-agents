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
import { getRegisteredWebTool, onAgentEvent, whenModelContext } from "@webmcp-agents/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { selectTools, type WebAgent } from "../agent";
import { newId } from "../shared";
import { listToolDescriptors } from "../tools";
import type { AdapterStatus, AgentAdapter, AgentMessage, ToolDescriptor } from "../types";
import { useAdapterStatus } from "./use-adapter-status";
import {
  allToolParts,
  canRestoreTo,
  initialSession,
  resumable,
  type SessionError,
  type SessionState,
  sessionReducer,
  userMessage,
} from "./reducer";
import {
  bindRestoreJournal,
  messageText,
  RestoreJournal,
  type RestoreResult,
  reverseFills,
  reverseToolCalls,
  toolsAfter,
  withoutRevert,
} from "./restore-journal";
import { clearAppSnapshots, type ChatRestoreSnapshots, loadAppSnapshots, reapplyCheckpoint, saveAppSnapshots } from "./restore-snapshot";
import { pagePath, runAgent, toolsSettled } from "./run-agent";

/** Options for `useAgentSession`. */
export interface UseAgentSessionOptions extends ChatRestoreSnapshots {
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
   * Cursor-like restore: stop the run, drop that user turn and everything after it, rewind the fills of every call
   * in it (and, without `applySnapshot`, each done call's optional `revert`), reapply the turn's URL / optional app
   * snapshot, and return the dropped text for the composer. `undefined` (nothing done) when `canRestoreTo` says no:
   * nothing comes after the message, or a confirmed action (an order placed, a flight booked) does; or while another
   * restore is under way. `send` waits for a restore to finish.
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
  { storageKey = "web-agents:chat", agent, getSnapshot, applySnapshot }: UseAgentSessionOptions = {},
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

  // ---------- fill journal + app snapshots (chat restore) ----------
  const journal = useRef(new RestoreJournal());
  // lazy: `useRef(load…)` would read and parse sessionStorage on every render (every streamed part)
  const [loadedApps] = useState(() => loadAppSnapshots(storageKey));
  const apps = useRef(loadedApps);
  /** A restore is rewinding the page: `send` waits for it (else its turn could be cut off, or run on a half-restored page). */
  const restoring = useRef(false);
  const snapshots = useRef({ getSnapshot, applySnapshot });
  snapshots.current = { getSnapshot, applySnapshot };
  useEffect(() => bindRestoreJournal(journal.current), []);
  // Re-hydrate if the storage key changes (rare); keep the same map otherwise.
  useEffect(() => {
    apps.current = loadAppSnapshots(storageKey);
  }, [storageKey]);

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
            /** A confirm-gated or destructive call that finished: the person committed to it (`canRestoreTo`). */
            let committed: string | undefined;
            if (part.type === "tool-result" || part.type === "tool-error") {
              const name = allToolParts(latest.current.messages).find((p) => p.id === part.id)?.name;
              if (name) journal.current.endCall(part.id, name);
              const tool = name && part.type === "tool-result" ? getRegisteredWebTool(name) : undefined;
              if (tool?.requireConfirmation || tool?.destructive) committed = part.id;
            }
            dispatch({ type: "part", part, within });
            if (committed) dispatch({ type: "committed", id: committed });
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
      if (!trimmed || restoring.current || latest.current.status === "streaming") return;
      const id = newId("u");
      const page = pagePath();
      try {
        apps.current.set(id, snapshots.current.getSnapshot?.());
        saveAppSnapshots(storageKey, apps.current);
      } catch (err) {
        console.error("[web-agents] getSnapshot threw", err);
      }
      dispatch({ type: "send", id, text: trimmed, page });
      void run([...latest.current.messages, userMessage(id, trimmed, page)]);
    },
    [run, storageKey],
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
      // one restore at a time; and never past a confirmed action (an order placed, a flight booked)
      if (restoring.current) return undefined;
      const { messages } = latest.current;
      if (!canRestoreTo(messages, messageId)) return undefined;
      const idx = messages.findIndex((m) => m.id === messageId);
      const target = messages[idx]!;
      restoring.current = true;
      try {
        stop();
        // Truncate first: the thread updates at once, and `send` stays shut (`restoring`) until the page is back, so
        // a message typed meanwhile can't be cut off by this restore or run against a half-restored page.
        dispatch({ type: "restore", beforeId: messageId });
        const app = apps.current.get(messageId);
        apps.current.forget(messages.slice(idx).map((m) => m.id));
        saveAppSnapshots(storageKey, apps.current);

        // Every call's fills (cancelled ones typed too); `revert` only for done calls.
        const calls = toolsAfter(messages, messageId);
        // Snapshot-first when the host provides applySnapshot: only rewind fills, then rehydrate
        // url+app. Calling tool.revert as well fights SPA routers (history.back vs navigate).
        const applySnapshot = snapshots.current.applySnapshot;
        let reverted: string[] = [];
        let skipped: string[];
        if (applySnapshot) {
          reverseFills(calls, journal.current);
          skipped = withoutRevert(calls);
        } else {
          ({ reverted, skipped } = await reverseToolCalls(calls, journal.current));
        }
        journal.current.forget(calls.map((p) => p.id));

        let snapshotApplied = false;
        try {
          snapshotApplied = await reapplyCheckpoint({ url: target.page, app }, applySnapshot, {
            afterRevert: reverted.length > 0,
          });
        } catch (err) {
          console.error("[web-agents] applySnapshot threw", err);
        }
        return { restoredText: messageText(target), reverted, skipped, snapshotApplied };
      } finally {
        restoring.current = false;
      }
    },
    [stop, storageKey],
  );

  const reset = useCallback(() => {
    stop();
    journal.current.clear();
    apps.current.clear();
    clearAppSnapshots(storageKey);
    dispatch({ type: "reset" });
  }, [stop, storageKey]);

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
