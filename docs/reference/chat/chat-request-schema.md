---
description: "The zod schema for the POST body of /api/chat, and the LIMITS it enforces."
---

# `chatRequestSchema`

The zod schema for the POST body of `/api/chat`, and the `LIMITS` it enforces. Counts, sizes and names are capped so a page, or anyone calling the endpoint, cannot send an unbounded prompt. [`createChatHandler`](./create-chat-handler.md) already applies it; use it when you write your own handler or test a client.

## Import

```ts
import { chatRequestSchema, chatTraceSchema, isCrossSite, LIMITS, TRACE_ID, validTraceparent } from "@webmcp-agents/chat/server";
import type { ChatRequest } from "@webmcp-agents/chat/server";
```

`LIMITS` is exported from `@webmcp-agents/chat/server` (and used by the client internally); the main entry does not export it.

## Example

A handler of your own that validates the body first and answers with the first issues.

<include meta='title="api/chat.ts"'>/_examples/shared/reference/chat/chat-request-schema.ts</include>

## Options

`chatRequestSchema.safeParse(body)` takes the parsed JSON body. Its fields (`ChatRequest`):

| Name | Type | Default | Description |
|---|---|---|---|
| `messages` | `AgentMessage[]` | required | The conversation, 1 to 160. Each has an `id` of 1 to 64 characters, a `role` of `"user"` or `"assistant"` and at most 40 `parts`. |
| `tools` | `{ name, description, inputSchema }[]` | required | The page's tools: at most 48, with unique names. |
| `page` | `{ url?: string }` | not set | Where the conversation happens. `url` is at most 2000 characters; only a same-origin path reaches the model. |
| `agent` | `string` | not set | The agent's id, matching `/^[a-zA-Z0-9_.-]{1,64}$/`, looked up in the handler's registry. An id only: instructions in the body are unknown keys and are stripped. |
| `trace` | `{ conversation, run, step, parent? }` | not set | Experimental (0.5.0). The run's ids for telemetry, sent by the cloud adapter with every step: see [`trace`](#trace). A 0.4.0 page sends none. |

### Rules per field

| Field | Rule |
|---|---|
| text part | `text` is at most 8000 characters. |
| reasoning part | `text` is at most 32 000 characters; `providerMetadata` at most 32 000 characters as JSON. |
| tool part | `id` is 1 to 128 characters; `name` matches the tool name rule; `state` is one of the [`ToolCallState`](./adapter-types.md#toolcallstate)s; `output.content` has at most 20 items; `error` and `prompt` are at most 8000 characters; `providerMetadata` at most 32 000 characters as JSON. A nested `agent` run is not accepted (the cloud adapter strips it). |
| tool `name` | `/^[a-zA-Z0-9_.-]{1,128}$/` |
| tool `description` | At most 1024 characters. |
| tool `inputSchema` | An object, at most 8192 characters as JSON. |

### `trace`

`chatTraceSchema`, the `trace` field. Any invalid value refuses the request (400) before a model call.

| Field | Rule |
|---|---|
| `conversation` | `TRACE_ID`: `/^[a-zA-Z0-9_.-]{1,64}$/` (a UUID fits). The same for every turn of one chat. |
| `run` | `TRACE_ID`. One user turn, or one sub-agent run. |
| `step` | An integer from 1 to 64: the model step within the run. |
| `parent` | `TRACE_ID`, optional. For a sub-agent's run, the id of the `delegate_to_*` call that started it. |

The request's `traceparent` header is not part of the body: a valid W3C one (`validTraceparent(header)`,
`00-<32 hex>-<16 hex>-<2 hex>`, ids not all zero) places the step under the browser's run; anything else is ignored.

### `LIMITS`

| Key | Value | Meaning |
|---|---|---|
| `bodyBytes` | 1 048 576 | Request body, counted while streaming. |
| `messages` | 160 | Messages per request. The cloud adapter trims the oldest past this. |
| `parts` | 40 | Parts per message. |
| `text` | 8000 | Characters per text, error or prompt. |
| `reasoning` | 32 000 | Characters of reasoning text (and its metadata). |
| `tools` | 48 | Tools per request. |
| `description` | 1024 | Characters per tool description. |
| `schemaBytes` | 8192 | Characters per input schema, as JSON. |

## Returns

`chatRequestSchema.safeParse(body)` gives `{ success: true, data: ChatRequest }` or `{ success: false, error }` with the zod issues. `ChatRequest` is `z.infer<typeof chatRequestSchema>`.

## Notes

- The body size is checked before parsing, by the handler (413), not by the schema.
- A tool output keeps `content` and `isError` only: other keys of a result do not reach the server.
- Only a same-origin path from `page.url` reaches the model, and only for a same-origin browser request.
- The schema is not strict: a 0.4.0 handler strips the `trace` a 0.5.0 page sends, and serves the request as before.
- `isCrossSite(req)` is the handler's cross-site rule, exported for other endpoints of the same app (the telemetry relay uses it): true when the request has an `Origin` that is not the endpoint's own. Requests without `Origin` (curl, server to server) pass; limiting them is a guard's job.

## See also

- [`createChatHandler`](./create-chat-handler.md)
- [`createCloudAdapter`](./create-cloud-adapter.md), the client that builds this body
- [Adapter types](./adapter-types.md)
