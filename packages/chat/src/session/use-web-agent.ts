/**
 * `useWebAgent`: run an agent from a component, with live status, and no chat on the page.
 *
 *   const agent = useWebAgent(shopper);
 *   <Button onClick={() => agent.invoke("Reorder my last purchase.")} disabled={agent.status === "running"}>
 *
 * The same loop as `agent.invoke` and `<AgentChat>` (./run-agent): the page's tools run under the cursor, a
 * confirm-gated tool waits for the person's click (`status` "waiting"), sub-agents run nested.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultAdapter } from "../adapter/cloud";
import type { WebAgent, WebAgentResult, WebAgentStep } from "../agent";
import { en } from "../customize/en";
import { newId } from "../shared";
import type { AgentAdapter } from "../types";
import type { SessionError } from "./reducer";
import { runAgent } from "./run-agent";

/** Options for `useWebAgent`. */
export interface UseWebAgentOptions {
  /** Runs the model. Default: one shared `createCloudAdapter()` (your `/api/chat`). */
  adapter?: AgentAdapter;
}

/**
 * Where a run is: `idle` (none yet, finished, or stopped), `running`, `waiting` (a tool is parked on the page until
 * the person clicks, see `steps`' `prompt`), `error` (the last run failed, see `error`).
 */
export type WebAgentStatus = "idle" | "running" | "waiting" | "error";

/** What `useWebAgent` returns. */
export interface WebAgentHandle {
  /**
   * Run the agent on one message (a fresh conversation each time; a run in flight is stopped first). Resolves with
   * the answer, or `undefined` when the run was stopped or failed: it never rejects, so `onClick={() =>
   * agent.invoke("…")}` needs no `catch`. A failure is in `error`.
   */
  invoke(text: string): Promise<WebAgentResult | undefined>;
  /** Stop the run in flight: the model, the tool running, any sub-agent. `status` goes back to `idle`. */
  stop(): void;
  status: WebAgentStatus;
  /** The tool calls of the current (or last) run, live: each with its state, a sub-agent's calls included. */
  steps: WebAgentStep[];
  /** The agent's answer so far, streamed. */
  text: string;
  /** Why the last run failed, with a code the adapter gave (offline, rate limited…). Cleared by the next `invoke`. */
  error?: SessionError;
}

const IDLE = { status: "idle" as WebAgentStatus, steps: [] as WebAgentStep[], text: "", error: undefined as SessionError | undefined };

/** Run `agent` from a component: `invoke`, `stop`, and the run's live `status`, `steps` and `text`. */
export function useWebAgent(agent: WebAgent, { adapter }: UseWebAgentOptions = {}): WebAgentHandle {
  const [state, setState] = useState(IDLE);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  // the latest render's agent and adapter, so `invoke` can stay one function
  const latest = useRef({ agent, adapter });
  latest.current = { agent, adapter };

  const invoke = useCallback(async (text: string): Promise<WebAgentResult | undefined> => {
    const prompt = typeof text === "string" ? text.trim() : "";
    if (!prompt) return undefined;
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const mine = (): boolean => controller.current === ctrl;
    setState({ ...IDLE, status: "running" });
    try {
      const run = await runAgent({
        adapter: latest.current.adapter ?? getDefaultAdapter(),
        agent: latest.current.agent,
        messages: [{ id: newId("u"), role: "user", parts: [{ type: "text", text: prompt }] }],
        signal: ctrl.signal,
        onChange: ({ text, steps }) => {
          if (!mine()) return;
          const waiting = steps.some((s) => s.state === "awaiting-confirmation");
          setState({ status: waiting ? "waiting" : "running", steps, text, error: undefined });
        },
      });
      if (!mine() || run.reason === "aborted") return undefined;
      const { text: answer, steps, messages } = run;
      if (run.reason === "error") {
        setState({
          status: "error",
          steps,
          text: answer,
          error: { message: run.error ?? en.errors.run_failed, code: run.code ?? "run_failed" },
        });
        return undefined;
      }
      setState({ status: "idle", steps, text: answer, error: undefined });
      return { text: answer, steps, messages };
    } finally {
      if (mine()) controller.current = null;
    }
  }, []);

  const stop = useCallback((): void => {
    controller.current?.abort();
    controller.current = null;
    // what was in flight shows as cancelled, like the chat's Stop
    setState((s) => ({
      ...s,
      status: "idle",
      steps: s.steps.map((step) =>
        step.state === "running" || step.state === "awaiting-confirmation" ? { ...step, state: "cancelled", prompt: undefined } : step,
      ),
    }));
  }, []);

  return { invoke, stop, ...state };
}
