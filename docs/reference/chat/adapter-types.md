---
description: "The contract between the chat widget and the agent that drives it."
---

# Adapter types

The contract between the chat widget and the agent that drives it. An adapter owns the model and tool loop and reports what happens as a stream of parts; the widget only renders them. Read this page to write your own adapter, or to understand what [`createCloudAdapter`](./create-cloud-adapter.md) and [`createLocalAdapter`](../local-agent/create-local-adapter.md) hand the chat.

## Import

```ts
import type { AdapterStatus, AgentAdapter, AgentMessage, AgentPart, AgentRunRequest, AgentStreamPart } from "@webmcp-agents/chat";
import type { ModelChoice, ToolCallState, ToolDescriptor, ToolOutput } from "@webmcp-agents/chat";
import type { RunRef, StepUsage } from "@webmcp-agents/chat"; // run telemetry (0.5.0, experimental)
```

## Example

A minimal adapter with no model: it calls the page's first tool through `req.callTool`, then reports what it found. It shows the shape every adapter follows: `message-start`, the parts, then `finish`.

<include meta='title="echo-adapter.ts"'>/_examples/shared/reference/chat/adapter-types.ts</include>

## Options

Each type's members, one table per type. The ones you implement are `AgentAdapter` (and its `run`); the others are what you receive or yield.

### `AgentAdapter`

An agent the chat can talk to: the model and tool loop behind a stream of parts.

| Name | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | required | Stable id; the widget remembers the chosen adapter by it. |
| `label` | `string` | required | Shown in the adapter switcher, for example "Claude (cloud)". |
| `labelParts` | `{ kind: "cloud" \| "on-device"; model?: string }` | — | What a built-in adapter is, so the chat words its name in the page's language ([`adapterLabel`](./adapter-label.md)) instead of showing `label`. Leave it out when you give an explicit `label`. |
| `run` | `(req: AgentRunRequest) => AsyncIterable<AgentStreamPart>` | required | Handle one user message: yield stream parts and call `req.callTool()` for each tool call. |
| `status` | `() => AdapterStatus` | always ready | Current availability. |
| `subscribe` | `(listener: () => void) => () => void` | not set | Called on status changes (a download progressing, the cloud check finishing). Returns an unsubscribe function. |
| `prepare` | `(signal?: AbortSignal) => Promise<void>` | not set | Opt-in heavy setup, such as a model download, started by the person's click. Aborting `signal` cancels it. |
| `models` | `() => readonly ModelChoice[]` | not set | The models the person can pick from. The widget shows a picker when there is more than one. |
| `selectModel` | `(id: string) => Promise<void>` | not set | Switch to one of `models()`; the status then describes what the new model needs. Rejects while a reply or a download is in progress. |

A `ModelChoice` describes one model in the picker:

| Name | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | required | The id `selectModel` takes. |
| `label` | `string` | required | Short name, for example "Qwen3 0.6B". |
| `brief` | `string` | required | One sentence on when to pick it. |
| `bytes` | `number` | not set | Download size in bytes, when known. |
| `cached` | `boolean` | not said | Already on this device: no download. |
| `recommended` | `boolean` | not said | The adapter's default. |
| `selected` | `boolean` | not said | The one in use. |

### `AdapterStatus`

Whether an adapter can run right now. The composer explains any state but `ready`.

| State | Members | Description |
|---|---|---|
| `ready` | | It can run. |
| `unavailable` | `reason: string`, `code?: ChatErrorCode` | It cannot, and why. With a `code`, the chat words it from its catalog; `reason` is the adapter's own words. |
| `needs-download` | `bytes?: number`, `note?: string` | A download must start first. `note` is a caveat for the download card, for example "No WebGPU here: a smaller, slower model runs on the CPU." |
| `downloading` | `progress: number` | Downloading; `progress` is 0 to 1. |
| `loading` | `progress?: number` | Starting up. Without `progress` it is a connection check (the cloud adapter); with `progress` it is a model already on this device being read from disk, which the widget words as a load, never as a download. |
| `error` | `error: string` | Setup failed. |

### `AgentRunRequest`

What an adapter gets for one run: one user message, possibly many model steps.

| Name | Type | Default | Description |
|---|---|---|---|
| `messages` | `AgentMessage[]` | required | The conversation so far, ending with the new user message (on Retry, with the last finished tool call). |
| `tools` | `ToolDescriptor[]` | required | The page's tools right now, already filtered through `agent`. A getter: tools change as the page changes, so read it fresh before every model call. |
| `signal` | `AbortSignal` | required | Aborts when the person presses Stop. |
| `callTool` | `(call: { id: string; name: string; input: unknown }) => Promise<ToolOutput>` | required | Run a tool on the page, cursor and all. Never rejects: failures come back as `isError` results. See [`callModelContextTool`](./call-model-context-tool.md). |
| `agent` | `WebAgent` | not set | The page's agent ([`defineWebAgent`](./define-web-agent.md)), when set. In-browser adapters read its `instructions` and `maxSteps`; the cloud adapter sends only its `id`. |
| `ref` | `RunRef` | set by the chat, `useWebAgent` and `agent.invoke` | Experimental. The run's ids: `conversation`, `run`, `parent` (the delegate call of a sub-agent's run) and `traceparent`. The cloud adapter sends them with every step (`trace` in the body, the `traceparent` header) so the server's spans join the browser's [run events](./on-agent-run.md). Absent when you drive an adapter yourself. |

### `AgentStreamPart`

What an adapter reports while it runs, in order. Start each assistant message with `message-start`; text, reasoning and tool calls refer to it by `messageId`. End the run with `finish` or `error`.

| `type` | Members | Description |
|---|---|---|
| `message-start` | `messageId` | A new assistant message begins. |
| `text-delta` | `messageId`, `delta` | More text for the message. |
| `reasoning` | `messageId`, `text`, `providerMetadata?` | The model's reasoning, kept for the next request, not rendered. |
| `tool-call` | `messageId`, `id`, `name`, `input`, `providerMetadata?` | The model calls a tool. `providerMetadata` is provider data that must travel with the call (Gemini thought signatures, OpenAI item ids). |
| `tool-result` | `id`, `output` | The call finished. |
| `tool-error` | `id`, `error` | The call failed. A text starting `Error [cancelled]` shows as cancelled, not failed. |
| `step-start` | `step` | Optional (0.5.0). A model step is about to start, before its request goes out. Without it, run events open the step at its first part. |
| `step-finish` | `step`, `usage?: StepUsage`, `model?` | A model step's reply is complete, before its tool calls run. `usage` and `model` are what the server reported for the step (absent on device). Run events report them on `step-finish`; one sent after the tool calls (0.4.0's place) still works, without its usage. |
| `finish` | `reason: "stop" \| "max-steps" \| "aborted"` | The run is over. |
| `error` | `error`, `code?: ChatErrorCode` | The run failed. The chat shows the catalog's text for `code` ([error codes](./chat-error-codes.md)); no code reads as `unknown`. `error` is the English text for callers that are not the UI. |

### `AgentMessage` and `AgentPart`

One turn of the conversation: `{ id: string; role: "user" | "assistant"; parts: AgentPart[] }`. A part is one of:

| `type` | Members | Description |
|---|---|---|
| `text` | `text` | Plain text. |
| `reasoning` | `text`, `providerMetadata?` | The model's reasoning, kept so the next request can send it back (Claude requires its signed thinking alongside its tool calls). Not rendered. |
| `tool` | `id`, `name`, `input`, `state`, `output?`, `error?`, `prompt?`, `agent?`, `providerMetadata?` | A tool call. `state` is a [`ToolCallState`](#toolcallstate). `prompt` is what the person should click while the call awaits confirmation. `agent` is `{ id, messages }`: a sub-agent's nested run behind a `delegate_to_<id>` call, rendered nested. `providerMetadata` travels with the call like reasoning's. |

### `ToolCallState`

`"running" | "awaiting-confirmation" | "done" | "error" | "cancelled"`: where a tool call is. `awaiting-confirmation` means it is parked on a control the person must click.

### `ToolDescriptor` and `ToolOutput`

A `ToolDescriptor` is a page tool as the model sees it:

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | The tool's name. |
| `description` | `string` | required | What it does; the model decides from this. |
| `inputSchema` | `JSONSchema` | required | Its parameters as JSON Schema. |

A `ToolOutput` is a tool call's result: an MCP result, `{ content, isError?, structuredContent? }` (`ModelContextToolResult` from `@webmcp-agents/core`).

## Returns

An adapter's `run` returns an `AsyncIterable<AgentStreamPart>`: the parts above, in order, ending with `finish` or `error`.

## Notes

- Run tool calls one at a time: one page, one cursor. The session matches confirmation events to calls by tool name.
- Yield `tool-result` or `tool-error` for every `tool-call`, with the same `id`.
- Create an adapter once, at module scope, not during render: the session and the status hook key on the adapter object.
- An adapter without `status()` is always `ready`. With `subscribe()`, the widget re-reads `status()` whenever you call the listener.
- For accurate [run events](./on-agent-run.md), frame each model step with `step-start` and `step-finish`, and yield a step's `tool-call` parts before its `step-finish` and before calling `req.callTool`. An adapter that does not still gets events: a step opens at its first part and closes when its first tool call starts.

## See also

- [Add the chat](../../build/add-the-chat.mdx)
- [`createCloudAdapter`](./create-cloud-adapter.md) and [`createLocalAdapter`](../local-agent/create-local-adapter.md)
- [`sessionReducer`](./session-reducer.md)
- [`callModelContextTool`](./call-model-context-tool.md)
- [`onAgentRun`](./on-agent-run.md)
