---
description: "A React hook for a conversation with one adapter about the current page, in the chat's own message shape."
---

# `useAgentSession`

A React hook for a conversation with one adapter about the current page, in the chat's own message shape. It is what `<AgentChat>` renders and what [`useAgentChat`](./use-agent-chat.md) wraps; reach for it to build a chat UI on the session logic directly.

## Import

```ts
import { useAgentSession } from "@webmcp-agents/chat";
import type {
  AgentSession,
  UseAgentSessionOptions,
} from "@webmcp-agents/chat";
```

## Example

A one-field chat: it sends the message, lists the replies' text, and offers Try again after a failed run.

<include meta='title="components/mini-chat.tsx"'>/_examples/shared/reference/chat/use-agent-session.tsx</include>

## Options

`useAgentSession(adapter, options?)`. The first argument is the adapter; the second is a `UseAgentSessionOptions`.

| Name | Type | Default | Description |
|---|---|---|---|
| `adapter` | `AgentAdapter` | required | The agent that runs the model loop (the first argument). Create it once, at module scope. |
| `storageKey` | `string \| false` | `"web-agents:chat"` | sessionStorage key for the conversation, so it survives route changes and reloads. `false` keeps it in memory only. |
| `agent` | `WebAgent` | not set | The page's agent ([`defineWebAgent`](./define-web-agent.md)). `tools` is filtered through it (plus one `delegate_to_<id>` tool per sub-agent), the request carries it, and a `delegate_to_*` call runs the sub-agent's own loop on the same adapter, nested under the call (`AgentPart.agent`). Without it the model sees every page tool and no instructions. |

## Returns

An `AgentSession`:

| Name | Type | Description |
|---|---|---|
| `messages` | `AgentMessage[]` | The conversation. |
| `status` | `"idle" \| "streaming" \| "error"` | Whether a run is streaming, or the last one failed. |
| `error` | `SessionError \| undefined` | The last run's failure: `{ message, code? }`. |
| `tools` | `ToolDescriptor[]` | What the model sees right now: the page's tools through the agent's filter, plus its delegate tools. |
| `adapterStatus` | `AdapterStatus` | The adapter's status, kept current through its `subscribe()`. An adapter without `status()` is `ready`. |
| `agent` | `WebAgent \| undefined` | The agent in use. |
| `send(text)` | `(text: string) => void` | Trim `text` and start a run. Ignored when empty or while streaming. |
| `stop()` | `() => void` | Abort the run; open tool calls become `cancelled`. |
| `retry()` | `() => void` | Resume the interrupted turn from its last finished tool call. Ignored while streaming or with no user message. |
| `restore(messageId)` | `(messageId: string) => Promise<RestoreResult \| undefined>` | Cursor-like rewind to before that **user** message: stop the run, reverse completed tools in the dropped span (field fills, then each tool's optional [`revert`](../core/define-web-tool.md)), drop that turn and everything after it. Returns `{ restoredText, reverted, skipped }` for the composer and tests, or `undefined` when the id is missing. See [Restore](#restore). |
| `reset()` | `() => void` | Stop and start a new conversation. |

### What a run does

1. Waits for the page's tools to settle (no `toolchange` for 100 ms, at most 1.5 s), then reads them.
2. Calls `adapter.run()` with the messages, a `tools` getter that always returns the latest list, an `AbortSignal` and a `callTool` that runs [`callModelContextTool`](./call-model-context-tool.md) with that signal.
3. After each tool call, waits for the tools to settle again (150 ms quiet, at most 1.5 s) and refreshes them, since the call may have navigated or opened a form.
4. Feeds every stream part to [`sessionReducer`](./session-reducer.md). Core `park` and `start` agent events mark the open call of that tool as `awaiting-confirmation` or `running`.

### Restore

`restore(userMessageId)` is conversation rewind, not a single-field undo toast:

1. Stops any in-flight run.
2. Collects completed (`done`) tool parts from that user message onward (nested `delegate_to_*` runs included), newest first.
3. For each call: writes prior field values back when the in-memory fill journal still has them (skipped after a reload), then calls the page tool's optional `revert(input, { output, … })` when the tool is still registered ([`getRegisteredWebTool`](../core/create-web-agents.md)).
4. Truncates messages to everything **before** that user message and returns the dropped text so the UI can put it in the composer.

Tools without `revert` are listed in `skipped`; the chat still truncates. Confirm-gated calls that never finished, and cancelled or errored calls, are not reversed.

## Notes

- **Retry resumes.** It sends [`resumable(messages)`](./session-reducer.md#resumable): the conversation through the last tool call that finished, so nothing is done twice (no second add to cart). With nothing finished, the turn starts over from the user's message.
- **Restore rewinds.** It drops a user turn and reverses page side effects best-effort; Retry continues an interrupted turn forward.
- Only the last 60 messages are stored. Loading from storage marks any call that was running as `cancelled`. Fill reverse needs the live journal, so it is skipped after a reload; `revert` still runs when the tool is on the page.
- A new `send` or `retry` aborts a previous run; parts from a superseded run are dropped.
- An adapter that throws becomes an `error` part with the thrown message.
- Unmounting aborts the run.
- Render it under `<WebAgentsProvider>` (or any page with `document.modelContext`); without WebMCP `tools` is empty.

## See also

- [Add the chat](../../build/add-the-chat.mdx), the page that teaches the chat
- [`useAgentChat`](./use-agent-chat.md), the same session as AI SDK `UIMessage`s
- [`sessionReducer` and `resumable`](./session-reducer.md)
- [`callModelContextTool`](./call-model-context-tool.md) and [`listToolDescriptors`](./list-tool-descriptors.md)
- [`<AgentChat>`](./agent-chat.md)
