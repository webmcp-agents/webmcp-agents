---
description: "An in-memory /api/chat for the real cloud adapter."
---

# `mockChatServer`

A fake `/api/chat`: the real `createChatHandler` on [`mockModel(steps)`](./mock-model.md), behind a `fetch` with a cookie jar. Give its `fetch` to `createCloudAdapter` to test the wire format, sessions and retries with no server.

## Import

```ts
import { mockChatServer, text, toolCall } from "@webmcp-agents/testing/chat";
```

## Example

```ts
const server = mockChatServer({
  steps: [toolCall("add_to_cart", { qty: 1 }), text("Added.")],
  session: true,
});
const cloud = createCloudAdapter({ fetch: server.fetch });
server.respondOnce({ status: 429, headers: { "retry-after": "30" } });
// … run the adapter …
expect(server.requests[2].body?.tools).toHaveLength(1);
```

## Options

`mockChatServer(options)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `steps` | `StepInput[]` | required | The model's steps, one per request (the last repeats). |
| `session` | `boolean` | `false` | Require a chat session, as the handler's `session`. |
| `handler` | `Record<string, unknown>` | none | Any other `createChatHandler` option. |

## Returns

A `MockChatServer`: `fetch`, `requests` (method, url, headers as the server saw them, parsed body) and `respondOnce(response)`, which answers the next request instead of the handler, once.

## Notes

Needs `@webmcp-agents/chat` and `ai`, loaded on the first request.

## See also

- [`mockModel`](./mock-model.md)
- [`createCloudAdapter`](../chat/create-cloud-adapter.md)
