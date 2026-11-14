/**
 * The model ↔ tool loop of one run, without React: the adapter runs the model, the page's tools run through
 * `callModelContextTool` (cursor and all), and `delegate_to_<id>` calls run the sub-agent's own loop on the same
 * adapter, right here. `useAgentSession` (and so `useAgentChat` and `<AgentChat>`), `useWebAgent` and `agent.invoke`
 * all run through `runAgent`: there is one implementation.
 *
 * Browser only: `agent.invoke` loads this module with a dynamic `import()`, so the agent definition stays plain data
 * a server can import.
 */
import { onAgentEvent, UI_HOST_ATTR } from "@webmcp-agents/core";
import { getDefaultAdapter } from "../adapter/cloud";
import {
  DELEGATE_PREFIX,
  isDelegateTool,
  selectTools,
  type WebAgent,
  type WebAgentInvokeOptions,
  type WebAgentResult,
  type WebAgentStep,
} from "../agent";
import { CANCELLED, newId } from "../shared";
import { callModelContextTool, listToolDescriptors } from "../tools";
import type { AgentAdapter, AgentMessage, AgentPart, AgentRunRequest, AgentStreamPart, ToolDescriptor, ToolOutput } from "../types";
import { type SessionState, sessionReducer } from "./reducer";

/** Options for `runAgent`. */
export interface RunAgentOptions {
  /** Runs the model. */
  adapter: AgentAdapter;
  /** The agent (`defineWebAgent`): its tool subset, instructions and sub-agents. Default: every page tool. */
  agent?: WebAgent;
  /** The conversation so far, ending with the new user message. */
  messages: AgentMessage[];
  /** Stops the run: the adapter, the tool in flight and any nested run. */
  signal: AbortSignal;
  /**
   * Every stream part, in order. `within`: the id of the `delegate_to_*` call whose sub-agent run the part belongs to.
   * Not called once `signal` aborted.
   */
  onPart?(part: AgentStreamPart, within?: string): void;
  /** Called whenever a tool call starts, parks on a confirmation, or ends; with every call so far. */
  onStep?(step: WebAgentStep, steps: readonly WebAgentStep[]): void;
  /** Called after every change (a streamed word, a tool call's state) with the run so far: for live UI. */
  onChange?(progress: WebAgentResult): void;
  /**
   * Read the page's tools now. Called before the run and after each tool call (once the page settled). Default: the
   * tools `document.modelContext` lists. A session passes its own, which also updates what it shows.
   */
  listTools?(): Promise<ToolDescriptor[]>;
}

/** How a run ended: the conversation, and why it stopped. */
export interface RunAgentResult extends WebAgentResult {
  reason: "stop" | "max-steps" | "aborted" | "error";
  /** The error's text, when `reason` is "error". */
  error?: string;
  /** The error's code, when the adapter gave one (offline, rate limited…). */
  code?: Extract<AgentStreamPart, { type: "error" }>["code"];
}

/** Busy regions that outlasted a whole wait: always busy, not loading a route (see `toolsSettled`). */
const lingering = new WeakSet<Element>();

/** The parts of the page that say they are still loading (`aria-busy`: a Suspense fallback, a skeleton), outside the library UIs. */
function busyRegions(): Element[] {
  return [...document.querySelectorAll('[aria-busy="true"]')].filter((el) => !lingering.has(el) && !el.closest(`[${UI_HOST_ATTR}]`));
}

/**
 * Resolve once the page's tools have stopped changing: no `toolchange` for `quiet` ms and nothing on the page
 * `aria-busy` meanwhile, or after `max` ms. A route that streams (a Suspense boundary) can mount its components, and
 * register their tools, well after the URL changed and the first tools moved: its loading state keeps the wait open,
 * and the quiet time counts from when it ends, since the tools register right after. A region still busy when a wait
 * gives up (a live feed, a spinner that never stops) is ignored from then on, or it would hold every step to `max`.
 */
export function toolsSettled(quiet = 150, max = 1500): Promise<void> {
  const mc = typeof document === "undefined" ? undefined : document.modelContext;
  if (!mc) return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    let last = started;
    const onChange = (): void => {
      last = Date.now();
    };
    const check = (): void => {
      const now = Date.now();
      const busy = busyRegions();
      if (busy.length) last = now;
      if (now - started >= max) for (const el of busy) lingering.add(el);
      if (now - last >= quiet || now - started >= max) {
        mc.removeEventListener("toolchange", onChange);
        resolve();
      } else setTimeout(check, 25);
    };
    mc.addEventListener("toolchange", onChange);
    setTimeout(check, 25);
  });
}

const text = (t: string): ToolOutput => ({ content: [{ type: "text", text: t }] });
const failed = (t: string): ToolOutput => ({ content: [{ type: "text", text: t }], isError: true });

/** The text of every assistant message in `messages`, joined: an agent's answer. */
export const answerText = (messages: readonly AgentMessage[]): string =>
  messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.parts)
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter((x) => x.trim())
    .join("\n\n")
    .trim();

/**
 * Where the page is, as `AgentMessage.page` holds it: path, query and hash (a search kept in the URL, a hash router),
 * capped at 300 characters.
 */
export const pagePath = (): string | undefined =>
  typeof location === "undefined" ? undefined : (location.pathname + location.search + location.hash).slice(0, 300);

/**
 * The history the model sees: a user message sent from another page than the one the previous turn left (where its
 * run ended, or where an unanswered message was sent from: the person navigated themself between turns) starts with a one-line note saying so, or the model reads "that item" against
 * what the last turn found. Only the sent copy changes; a conversation where nothing moved goes out as is, and the
 * note stays on that message in later requests, so the prompt prefix (and its cache) is stable.
 */
export function withPageMoves(messages: AgentMessage[]): AgentMessage[] {
  let moved = false;
  const out = messages.map((m, i) => {
    const before = messages[i - 1];
    if (m.role !== "user" || !m.page || !before?.page || before.page === m.page) return m;
    moved = true;
    const note = `(Since your last reply the user went from the page ${JSON.stringify(before.page)} to ${JSON.stringify(m.page)} on their own. This message is about the page they are on now; earlier results may no longer apply.)`;
    return { ...m, parts: [{ type: "text" as const, text: note }, ...m.parts] };
  });
  return moved ? out : messages;
}

type ToolPart = Extract<AgentPart, { type: "tool" }>;

/** Every tool call in `messages` as a step, nested sub-agent runs included (each with the sub-agent's id). */
export function stepsOf(messages: readonly AgentMessage[], agent?: string): WebAgentStep[] {
  const out: WebAgentStep[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type !== "tool") continue;
      out.push(stepOf(p, agent));
      if (p.agent) out.push(...stepsOf(p.agent.messages, p.agent.id));
    }
  }
  return out;
}

const stepOf = (p: ToolPart, agent: string | undefined): WebAgentStep => ({
  id: p.id,
  tool: p.name,
  input: p.input,
  state: p.state,
  ...(p.output && { output: p.output }),
  ...(p.error !== undefined && { error: p.error }),
  ...(p.prompt !== undefined && { prompt: p.prompt }),
  ...(agent && { agent }),
});

/**
 * Run `agent` on the conversation `messages` with `adapter` until it answers, fails or is stopped. Never rejects:
 * a failure is `reason: "error"` (and an `error` part through `onPart`).
 */
export async function runAgent({
  adapter,
  agent,
  messages,
  signal,
  onPart,
  onStep,
  onChange,
  listTools,
}: RunAgentOptions): Promise<RunAgentResult> {
  let tools: ToolDescriptor[] = [];
  const refresh = async (): Promise<void> => {
    tools = await (listTools ?? listToolDescriptors)().catch(() => tools);
  };

  // ---------- our own copy of the conversation: the result, and the steps ----------
  let state: SessionState = { messages, status: "streaming" };
  let steps: WebAgentStep[] = [];
  const update = (next: SessionState): void => {
    if (next === state) return;
    state = next;
    if (!onStep && !onChange) return;
    const own = state.messages.slice(messages.length);
    const now = stepsOf(own);
    for (const step of now) {
      const before = steps.find((s) => s.id === step.id);
      if (!before || before.state !== step.state || before.prompt !== step.prompt) onStep?.(step, now);
    }
    steps = now;
    onChange?.({ text: answerText(own), steps: now, messages: state.messages });
  };
  const report = (part: AgentStreamPart, within?: string): void => {
    if (signal.aborted) return; // stopped (or superseded): what is still in flight is no one's business
    update(sessionReducer(state, { type: "part", part, within }));
    onPart?.(part, within);
  };
  // The page's tools change while the model thinks too (the person navigates): keep the list current.
  const mc = typeof document === "undefined" ? undefined : document.modelContext;
  const onToolChange = (): void => void refresh();
  mc?.addEventListener("toolchange", onToolChange);
  // A tool parked on the person's click: the visual layer says so (and that it runs again after the click).
  const off = onAgentEvent((e) => {
    if (signal.aborted) return;
    if (e.type === "park")
      update(sessionReducer(state, { type: "toolPhase", name: e.tool, state: "awaiting-confirmation", prompt: e.prompt }));
    else if (e.type === "start") update(sessionReducer(state, { type: "toolPhase", name: e.tool, state: "running" }));
  });

  const result = (reason: RunAgentResult["reason"], error?: Extract<AgentStreamPart, { type: "error" }>): RunAgentResult => {
    const own = state.messages.slice(messages.length);
    return {
      text: answerText(own),
      steps: stepsOf(own),
      messages: state.messages,
      reason,
      ...(error && { error: error.error }),
      ...(error?.code && { code: error.code }),
    };
  };

  try {
    // The page may still be rendering (a route the person just opened): start from its settled tools.
    await toolsSettled(100);
    await refresh();
    if (signal.aborted) return result("aborted");

    /**
     * The request one agent sees: its tools (read fresh each step), its definition, and a `callTool` that runs page
     * tools under the cursor and `delegate_to_*` tools as nested runs of the sub-agent.
     */
    const makeRequest = (history: AgentMessage[], def: WebAgent | undefined): AgentRunRequest => ({
      messages: history,
      get tools() {
        return selectTools(def, tools);
      },
      signal,
      agent: def,
      callTool: async (call) => {
        const sub = isDelegateTool(call.name) ? def?.agents.find((a) => a.id === call.name.slice(DELEGATE_PREFIX.length)) : undefined;
        if (sub) return runDelegate(sub, call);
        const output = await callModelContextTool(call, { signal });
        // The call may have changed the page (a navigation, a form appearing): let its tools settle first.
        await toolsSettled();
        await refresh();
        return output;
      },
    });

    /**
     * A sub-agent's run: one user message (the task), its own tools and step budget, on the same adapter. Its parts are
     * reported nested under the delegate call; its final text is the call's output. Bounded by the sub-agent's
     * `maxSteps`, not by the page tool timeout (it isn't a page tool).
     */
    async function runDelegate(sub: WebAgent, call: { id: string; name: string; input: unknown }): Promise<ToolOutput> {
      const input = (call.input ?? {}) as { task?: unknown; context?: unknown };
      const task = typeof input.task === "string" ? input.task.trim() : "";
      if (!task) return failed(`Error [invalid_input]: delegate_to_${sub.id} needs a "task" string.`);
      const prompt = typeof input.context === "string" && input.context.trim() ? `${task}\n\nContext: ${input.context.trim()}` : task;
      // our own copy of the sub-agent's run (the parent's copy is nested in `state`)
      let nested: SessionState = { messages: [], status: "streaming" };
      let reason: "stop" | "max-steps" | "aborted" | "error" = "stop";
      let error = "";
      try {
        for await (const part of adapter.run(
          makeRequest([{ id: newId("u"), role: "user", parts: [{ type: "text", text: prompt }] }], sub),
        )) {
          if (signal.aborted) break; // superseded or stopped
          report(part, call.id);
          nested = sessionReducer(nested, { type: "part", part });
          if (part.type === "finish") reason = part.reason;
          else if (part.type === "error") {
            reason = "error";
            error = part.error;
          }
        }
      } catch (err) {
        reason = "error";
        error = err instanceof Error ? err.message : String(err);
      }
      if (signal.aborted) return failed(CANCELLED);
      if (reason === "error") return failed(`Error [failed]: The ${sub.id} agent failed: ${error}`);
      const answer = answerText(nested.messages);
      if (answer) return text(answer);
      return reason === "max-steps"
        ? failed(`Error [failed]: The ${sub.id} agent stopped after ${sub.maxSteps ?? "its"} steps without finishing.`)
        : text(`The ${sub.id} agent finished without a summary.`);
    }

    let end: RunAgentResult["reason"] = "stop";
    let failure: Extract<AgentStreamPart, { type: "error" }> | undefined;
    try {
      for await (const part of adapter.run(makeRequest(withPageMoves(messages), agent))) {
        if (signal.aborted) return result("aborted");
        report(part);
        if (part.type === "finish") end = part.reason;
        else if (part.type === "error") {
          end = "error";
          failure = part;
        }
      }
    } catch (err) {
      if (signal.aborted) return result("aborted");
      failure = { type: "error", error: err instanceof Error ? err.message : String(err) };
      end = "error";
      report(failure);
    }
    return result(signal.aborted ? "aborted" : end, failure);
  } finally {
    off();
    mc?.removeEventListener("toolchange", onToolChange);
  }
}

/**
 * One fresh run of `agent` on `text`: what `agent.invoke` does once this module is loaded, and what `useWebAgent`
 * calls. Resolves with the answer; rejects when the run fails (an `Error` with the adapter's message) or `signal`
 * aborts (an `AbortError`).
 */
export async function invokeAgent(agent: WebAgent, text: string, options: WebAgentInvokeOptions = {}): Promise<WebAgentResult> {
  const prompt = typeof text === "string" ? text.trim() : "";
  if (!prompt) throw new TypeError(`${agent.id}.invoke() needs a message, e.g. ${agent.id}.invoke("Reorder my last purchase.").`);
  const { signal = new AbortController().signal, onStep } = options;
  const aborted = (): unknown => signal.reason ?? new DOMException("The agent run was aborted.", "AbortError");
  if (signal.aborted) throw aborted();
  const run = await runAgent({
    adapter: options.adapter ?? getDefaultAdapter(),
    agent,
    messages: [{ id: newId("u"), role: "user", parts: [{ type: "text", text: prompt }] }],
    signal,
    onStep: onStep && ((step) => onStep(step)),
  });
  if (run.reason === "aborted" || signal.aborted) throw aborted();
  if (run.reason === "error") throw Object.assign(new Error(run.error ?? "The agent run failed."), run.code ? { code: run.code } : {});
  return { text: run.text, steps: run.steps, messages: run.messages };
}
