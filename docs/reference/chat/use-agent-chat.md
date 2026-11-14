---
description: "The chat as a useChat-shaped React hook: the conversation as AI SDK UIMessages, the adapter choice and its memory, the adapter's status and models, and the suggestions."
---

# `useAgentChat`

The chat as a `useChat`-shaped React hook: the conversation as AI SDK `UIMessage`s, the adapter choice and its memory, the adapter's status and models, and the suggestions. Use it to render the chat with your own components (shadcn/ui's AI patterns, or anything that reads `UIMessage` parts). [`<AgentChat>`](./agent-chat.md) is built on it, so a custom UI and the built-in widget agree on every state.

## Import

```ts
import { useAgentChat } from "@webmcp-agents/chat";
import type {
  AgentChatState,
  ToolPhase,
  UseAgentChatOptions,
} from "@webmcp-agents/chat";
```

## Example

A minimal chat: text parts, a tool call that says when it is parked on the page for the person's click, the starter prompts, and Stop and Try again.

<include meta='title="components/my-chat.tsx"'>/_examples/shared/reference/chat/use-agent-chat.tsx</include>

The `agent-chat` block of the `@webmcp-agents` registry is a complete chat built this way: see [Use your shadcn components](../../more/shadcn-chat-blocks.mdx).

## Options

`useAgentChat(options?)` takes a `UseAgentChatOptions`; every option is optional.

| Name | Type | Default | Description |
|---|---|---|---|
| `adapter` | `AgentAdapter` | one shared `createCloudAdapter()` | The one adapter that runs the model. With neither `adapter` nor `adapters`, the chat uses the shared cloud adapter (your `/api/chat`) that [`<AgentChat>`](./agent-chat.md), `agent.invoke` and [`useWebAgent`](./use-web-agent.md) use. |
| `adapters` | `readonly AgentAdapter[]` | not set | Several adapters (cloud, on-device…) for a switcher. The first is the default; the person's choice is remembered in localStorage (`web-agents:chat:adapter`) while that adapter is still offered. |
| `agent` | `WebAgent` | not set | The page's agent ([`defineWebAgent`](./define-web-agent.md)): its instructions, the tools it may use and its sub-agents. Without it the model sees every page tool and no instructions. |
| `storageKey` | `string \| false` | `"web-agents:chat"` | sessionStorage key for the conversation, so it survives route changes and reloads. `false` keeps it in memory only. |
| `getSnapshot` | `() => unknown` | — | Optional JSON-serializable app state captured per user turn (passed through; persisted with the session). |
| `applySnapshot` | `(snapshot: { url?: string; app?: unknown }) => void \| Promise<void>` | default URL restore | Reapply a stage checkpoint after `revert` (SPA apps should `navigate(url)` and rehydrate `app`). |

## Returns

An `AgentChatState`:

| Name | Type | Description |
|---|---|---|
| `messages` | `UIMessage[]` | The conversation for rendering. `text` and `reasoning` parts carry `state` (`streaming` on the last part while the run streams); tool calls are `dynamic-tool` parts with `input-available` (running or parked), `output-available` or `output-error` (`errorText`; a cancelled call carries `Error [cancelled]: …`). Messages left empty are kept. |
| `status` | `"submitted" \| "streaming" \| "ready" \| "error"` | AI SDK `ChatStatus` names: `submitted` until the reply's first part, then `streaming`, then `ready`; `error` after a failed run. |
| `error` | `SessionError` | The last run's failure: `{ message, code? }`. |
| `sendMessage({ text })` | `(input: { text: string }) => void` | Send a message. Ignored when empty or while streaming. |
| `stop()` | `() => void` | Stop the run; open tool calls become `cancelled`. |
| `regenerate()` | `() => void` | Resume the interrupted turn from its last finished tool call, so nothing is done twice. |
| `clear()` | `() => void` | Stop and start a new conversation. |
| `restore(messageId)` | `(messageId: string) => Promise<RestoreResult \| undefined>` | Same as [`session.restore`](./use-agent-session.md#restore): rewind to before that user message (fills, `revert`, URL/app snapshot) and return the dropped text for the composer. |
| `tools` | `ToolDescriptor[]` | What the model sees right now: the page's tools through the agent's filter, plus its delegate tools. |
| `suggestions` | `string[]` | Starter prompts derived from the page's tools. |
| `adapters` | `readonly AgentAdapter[]` | The adapters on offer. |
| `adapter` | `AgentAdapter` | The one in use. |
| `selectAdapter(id)` | `(id: string) => void` | Switch adapter and remember the choice. |
| `adapterStatus` | `AdapterStatus` | Whether the adapter is ready: see [`AdapterStatus`](./adapter-types.md#adapterstatus). |
| `models` | `readonly ModelChoice[]` | The current adapter's models, when it offers any (otherwise empty). |
| `selectModel(id)` | `(id: string) => Promise<void>` | Switch the adapter's model. Absent when the adapter has none to choose. |
| `prepare(signal)` | `(signal?: AbortSignal) => Promise<void>` | Start the adapter's opt-in setup, such as a model download; aborting `signal` cancels it. Absent when the adapter needs none. |
| `agent` | `WebAgent \| undefined` | The agent in use. |
| `toolPhase(part)` | `(part: UIMessage["parts"][number]) => ToolPhase \| undefined` | The web-agents state of a tool part: `phase` is `"parked"` (waiting for the person's click on the page, with `prompt` to show), `"running"`, `"done"`, `"error"` or `"cancelled"`; for a `delegate_to_<id>` call, `agent` holds the sub-agent's id and its nested run as `UIMessage`s. `undefined` for parts that are not tool calls. |
| `session` | `AgentSession` | The underlying [`AgentSession`](./use-agent-session.md), for UIs that render the chat's own message shape. |

## Notes

- The `UIMessage` shape is canonical: nothing web-agents-specific is added to parts. `toolPhase` is the one extra.
- Reasoning parts keep their `providerMetadata` (signed thinking); the hook renders what the session has and never mutates it.
- Create custom adapters once, at module scope: the session and the status hook key on the adapter object.
- Render it under `<WebAgentsProvider>` (or any page with `document.modelContext`); without WebMCP `tools` is empty.

## See also

- [Add the chat](../../build/add-the-chat.mdx) and [Use your shadcn components](../../more/shadcn-chat-blocks.mdx)
- [`<AgentChat>`](./agent-chat.md), the built-in widget
- [`useAgentSession`](./use-agent-session.md), the same session in the chat's own message shape
- [`useWebAgent`](./use-web-agent.md), to run an agent with no chat
- [Adapter types](./adapter-types.md)
