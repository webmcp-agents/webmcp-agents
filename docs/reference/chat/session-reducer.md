---
description: "The chat session as a pure state machine: the messages, whether a run is streaming, and the last error."
---

# `sessionReducer`

The chat session as a pure state machine: the messages, whether a run is streaming, and the last error. Use it when you manage a conversation yourself or test one in Node; [`useAgentSession`](./use-agent-session.md) feeds it adapter stream parts and core agent events. `resumable` decides what Retry sends.

## Import

```ts
import { resumable, sessionReducer } from "@webmcp-agents/chat";
import type {
  SessionAction,
  SessionError,
  SessionState,
} from "@webmcp-agents/chat";
```

## Example

Play what an adapter streams into a session, then ask what Retry would send after the run failed.

<include meta='title="session.ts"'>/_examples/shared/reference/chat/session-reducer.ts</include>

## Options

`sessionReducer(state, action)` is a reducer, so `useReducer(sessionReducer, { messages: [], status: "idle" })` works as is. `resumable(messages)` takes only the messages.

| Name | Type | Default | Description |
|---|---|---|---|
| `state` | `SessionState` | required | The session so far: `messages: AgentMessage[]`, `status: "idle" \| "streaming" \| "error"` and `error?: SessionError`. A new conversation is `{ messages: [], status: "idle" }`. |
| `action` | `SessionAction` | required | What happened: one of the actions below. |

A `SessionError` is `{ message: string; code?: "chat_disabled" | "rate_limited" | "bad_request" | "network" }`: the failure's text and a code the widget can explain.

### Actions

| Action | Effect |
|---|---|
| `{ type: "send", id, text }` | Appends a user message with one text part; `status` becomes `streaming`; clears `error`. |
| `{ type: "part", part, within? }` | Applies one [`AgentStreamPart`](./adapter-types.md#agentstreampart) (below). With `within`, the part belongs to a sub-agent's run behind the `delegate_to_*` call with that id: it is applied to that call's nested messages (`AgentPart.agent.messages`) by the same state machine. A nested `finish` or `error` ends only the nested run; the parent stays streaming. |
| `{ type: "toolPhase", name, state, prompt? }` | A core agent event about a running tool: sets the newest open call of that tool name to `state` (`"running"` or `"awaiting-confirmation"`) and `prompt`. Calls run one at a time, so the name is enough. Reaches nested calls too. |
| `{ type: "stop" }` | `status` becomes `idle`; every `running` or `awaiting-confirmation` call, nested ones included, becomes `cancelled`. |
| `{ type: "retry" }` | No-op without a user message. Otherwise `status` becomes `streaming` and the messages become `resumable(messages)`. |
| `{ type: "restore", beforeId }` | No-op when `beforeId` is not a user message. Otherwise keeps messages before that id, sets `status` to `idle`, and clears `error`. Page rewind (fills / `revert`) is done by [`useAgentSession.restore`](./use-agent-session.md#restore) before this action. |
| `{ type: "reset" }` | Back to the empty session. |

### Stream parts

| Part | Effect |
|---|---|
| `message-start` | Appends an empty assistant message. |
| `text-delta` | Appends to the message's last text part, or adds one. |
| `reasoning` | Adds a reasoning part (kept for the next request, not rendered). |
| `tool-call` | Adds a tool part in state `running`. |
| `tool-result` | That call becomes `done` with its `output`. |
| `tool-error` | That call becomes `cancelled` when [`isCancelled(error)`](./call-model-context-tool.md#cancelled-and-iscancelled), else `error`. |
| `step-finish` | No change. |
| `finish` | `status` becomes `idle`; with `reason: "aborted"`, open calls become `cancelled`. |
| `error` | `status` becomes `error`, `error` is set, open calls become `cancelled`. |

## Returns

`sessionReducer` returns the next `SessionState` (the same object when a `toolPhase` changed nothing).

### `resumable`

`resumable(messages: AgentMessage[]): AgentMessage[]` returns a new array: what Retry sends. It is the conversation through the last tool call that finished (`done` or `error`) after the last user message. What came after it goes: unfinished calls (dropped, not reported to the model as "Cancelled by the user") and a reply cut short. With no finished call, it returns the messages through the last user message, so the turn starts over. Without any user message it returns `messages` unchanged.

## Notes

- Pure and DOM-free: safe to test in Node.
- `useAgentSession` applies `stop` to a conversation loaded from sessionStorage, so a reload never shows a call as still running.

## See also

- [Add the chat](../../build/add-the-chat.mdx), the page that teaches the chat
- [`useAgentSession`](./use-agent-session.md)
- [Adapter types](./adapter-types.md)
- [Tool error codes](../core/tool-error.md)
