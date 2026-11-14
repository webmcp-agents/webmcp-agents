/**
 * The conversation as plain data: messages, whether a run is streaming, and
 * the last error. Pure, so it's tested in Node; the hook feeds it adapter
 * stream parts and core agent events.
 */
import { isCancelled } from "../shared";
import type { AgentMessage, AgentPart, AgentStreamPart, ToolCallState } from "../types";

/** The last run's failure, with a code the widget can explain (offline, rate limited…). */
export interface SessionError {
  message: string;
  code?: Extract<AgentStreamPart, { type: "error" }>["code"];
}

/** A conversation: its messages, whether a run is streaming, and the last error. */
export interface SessionState {
  messages: AgentMessage[];
  status: "idle" | "streaming" | "error";
  error?: SessionError;
}

/** What can happen to a session. */
export type SessionAction =
  /** `page`: the path the person sent it from (see `AgentMessage.page`). */
  | { type: "send"; id: string; text: string; page?: string }
  /** A run is over (answered, stopped or failed): the path the page is on now goes on its last message. */
  | { type: "ended"; page?: string }
  /** `within`: the id of the `delegate_to_*` call whose sub-agent run this part belongs to (rendered nested). */
  | { type: "part"; part: AgentStreamPart; within?: string }
  /** A core agent event about a running tool, matched by tool name (calls run one at a time). */
  | { type: "toolPhase"; name: string; state: "running" | "awaiting-confirmation"; prompt?: string }
  | { type: "stop" }
  /** Run again from the interrupted turn's last finished tool call (see `resumable`); what came after it goes. */
  | { type: "retry" }
  /** Drop the user message `beforeId` and everything after it (chat restore). */
  | { type: "restore"; beforeId: string }
  | { type: "reset" };

/** An empty conversation. */
export const initialSession: SessionState = { messages: [], status: "idle" };

type ToolPart = Extract<AgentPart, { type: "tool" }>;
const OPEN: readonly ToolCallState[] = ["running", "awaiting-confirmation"];

/** Every tool part, nested sub-agent runs included, in document order. */
export function allToolParts(messages: readonly AgentMessage[]): ToolPart[] {
  const out: ToolPart[] = [];
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type !== "tool") continue;
      out.push(p);
      if (p.agent) out.push(...allToolParts(p.agent.messages));
    }
  }
  return out;
}

/** Replace the tool part(s) matching `match` in every message, nested sub-agent runs included. */
function updateTools(messages: AgentMessage[], match: (p: ToolPart) => boolean, patch: (p: ToolPart) => Partial<ToolPart>): AgentMessage[] {
  let changed = false;
  const next = messages.map((m) => {
    const parts = m.parts.map((p) => {
      if (p.type !== "tool") return p;
      let out: ToolPart = p;
      if (p.agent) {
        const nested = updateTools(p.agent.messages, match, patch);
        if (nested !== p.agent.messages) out = { ...out, agent: { ...p.agent, messages: nested } };
      }
      if (match(p)) out = { ...out, ...patch(p) };
      return out;
    });
    if (parts.every((p, i) => p === m.parts[i])) return m;
    changed = true;
    return { ...m, parts };
  });
  return changed ? next : messages;
}

function updateMessage(messages: AgentMessage[], id: string, update: (parts: AgentPart[]) => AgentPart[]): AgentMessage[] {
  return messages.map((m) => (m.id === id ? { ...m, parts: update(m.parts) } : m));
}

const cancelOpen = (messages: AgentMessage[]): AgentMessage[] =>
  updateTools(
    messages,
    (p) => OPEN.includes(p.state),
    () => ({ state: "cancelled", prompt: undefined }),
  );

/**
 * What Retry sends: the conversation through the last tool call that finished in the interrupted turn, so the agent
 * picks up from there instead of redoing it (adding to the cart twice). What came after (unfinished calls, a reply cut
 * short) goes; with nothing finished, the turn restarts from the user's message.
 */
export function resumable(messages: AgentMessage[]): AgentMessage[] {
  const user = messages.findLastIndex((m) => m.role === "user");
  if (user === -1) return messages;
  const finished = (p: AgentPart): boolean => p.type === "tool" && (p.state === "done" || p.state === "error");
  // a call the failure cut short isn't the user's Stop: drop it rather than tell the model "Cancelled by the user"
  const keep = (parts: AgentPart[]): AgentPart[] => parts.filter((p) => p.type !== "tool" || finished(p));
  for (let i = messages.length - 1; i > user; i--) {
    const m = messages[i]!;
    const last = m.parts.findLastIndex(finished);
    if (last === -1) continue;
    const turn = [...messages.slice(user + 1, i), { ...m, parts: m.parts.slice(0, last + 1) }];
    return [...messages.slice(0, user + 1), ...turn.map((t) => ({ ...t, parts: keep(t.parts) }))];
  }
  return messages.slice(0, user + 1);
}

function applyPart(state: SessionState, part: AgentStreamPart): SessionState {
  const { messages } = state;
  switch (part.type) {
    case "message-start":
      return { ...state, messages: [...messages, { id: part.messageId, role: "assistant", parts: [] }] };
    case "text-delta":
      return {
        ...state,
        messages: updateMessage(messages, part.messageId, (parts) => {
          const last = parts.at(-1);
          return last?.type === "text"
            ? [...parts.slice(0, -1), { ...last, text: last.text + part.delta }]
            : [...parts, { type: "text", text: part.delta }];
        }),
      };
    case "reasoning":
      return {
        ...state,
        messages: updateMessage(messages, part.messageId, (parts) => [
          ...parts,
          { type: "reasoning", text: part.text, providerMetadata: part.providerMetadata },
        ]),
      };
    case "tool-call":
      return {
        ...state,
        messages: updateMessage(messages, part.messageId, (parts) => [
          ...parts,
          { type: "tool", id: part.id, name: part.name, input: part.input, state: "running" },
        ]),
      };
    case "tool-result":
      return {
        ...state,
        messages: updateTools(
          messages,
          (p) => p.id === part.id,
          () => ({ state: "done", output: part.output, prompt: undefined }),
        ),
      };
    case "tool-error":
      return {
        ...state,
        messages: updateTools(
          messages,
          (p) => p.id === part.id,
          () => ({ state: isCancelled(part.error) ? "cancelled" : "error", error: part.error, prompt: undefined }),
        ),
      };
    case "step-finish":
      return state;
    case "finish":
      return { ...state, status: "idle", messages: part.reason === "aborted" ? cancelOpen(messages) : messages };
    case "error":
      return { ...state, status: "error", error: { message: part.error, code: part.code }, messages: cancelOpen(messages) };
  }
}

/**
 * Apply a sub-agent's stream part to the nested run of the delegate call `within`: the same state machine on the
 * call's own messages. A nested `finish` or `error` ends only the nested run; the parent's status stays as is.
 */
function applyWithin(state: SessionState, within: string, part: AgentStreamPart): SessionState {
  const target = allToolParts(state.messages).find((p) => p.id === within);
  if (!target) return state;
  const agentId = target.agent?.id ?? target.name.replace(/^delegate_to_/, "");
  const nested = applyPart({ messages: target.agent?.messages ?? [], status: "streaming" }, part).messages;
  return {
    ...state,
    messages: updateTools(
      state.messages,
      (p) => p.id === within,
      () => ({ agent: { id: agentId, messages: nested } }),
    ),
  };
}

/** A message the person sent from `page` (see `AgentMessage.page`): what `send` adds, and what the session runs. */
export const userMessage = (id: string, text: string, page?: string): AgentMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
  ...(page && { page }),
});

/** The session state machine: stream parts, tool phases from the agent cursor, stop, retry, reset. */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "send":
      return {
        status: "streaming",
        messages: [...state.messages, userMessage(action.id, action.text, action.page)],
      };
    case "ended": {
      const last = state.messages.at(-1);
      if (!action.page || last?.role !== "assistant" || last.page === action.page) return state;
      return { ...state, messages: [...state.messages.slice(0, -1), { ...last, page: action.page }] };
    }
    case "part":
      return action.within ? applyWithin(state, action.within, action.part) : applyPart(state, action.part);
    case "toolPhase": {
      // the newest open call of that tool (a sub-agent's nested calls included)
      const open = allToolParts(state.messages).filter((p) => p.name === action.name && OPEN.includes(p.state));
      const target = open.at(-1);
      if (!target || (target.state === action.state && target.prompt === action.prompt)) return state;
      return {
        ...state,
        messages: updateTools(
          state.messages,
          (p) => p === target,
          () => ({ state: action.state, prompt: action.prompt }),
        ),
      };
    }
    case "stop":
      return { ...state, status: "idle", messages: cancelOpen(state.messages) };
    case "retry":
      if (!state.messages.some((m) => m.role === "user")) return state;
      return { status: "streaming", messages: resumable(state.messages) };
    case "restore": {
      const idx = state.messages.findIndex((m) => m.id === action.beforeId && m.role === "user");
      if (idx === -1) return state;
      return { messages: state.messages.slice(0, idx), status: "idle", error: undefined };
    }
    case "reset":
      return initialSession;
  }
}
