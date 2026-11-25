---
description: "Build /api/chat requests, read the streamed answer, carry a session."
---

# `chatRequest, readChatStream, withSession`

Three helpers for tests of `createChatHandler`: `chatRequest` builds a request as the cloud adapter sends it, `readChatStream` reads the answer to the end, and `withSession` starts a session the way the page does.

## Import

```ts
import { chatRequest, readChatStream, withSession } from "@webmcp-agents/testing/server";
```

## Example

```ts
const send = await withSession(handler);
const req = chatRequest({ messages: ["hi"], tools: ["add_to_cart"] });
const parts = await readChatStream(await send(req));
expect(parts).toContainEqual(
  expect.objectContaining({ type: "tool-call", name: "add_to_cart" }),
);
```

## Options

`chatRequest(body, options?)`: `body.messages` takes strings (user messages) or `AgentMessage`s, `body.tools` names or descriptors; anything else in `body` is sent as is.

| Name | Type | Default | Description |
|---|---|---|---|
| `origin` | `string` | none | The `Origin` header: another site's gets `403`. |
| `headers` | `Record<string, string>` | none | More headers. |
| `url` | `string` | `http://localhost/api/chat` | The URL. |

## Returns

`chatRequest`: a `Request`. `readChatStream`: the parts (`text-delta`, `reasoning`, `tool-call`, `error`, `finish`, else `other`), each with its raw chunk; it rejects with a sentence for a non-stream answer. `withSession`: a `send(req)` that carries the cookie.

## See also

- [`mockModel`](./mock-model.md)
- [Security: sessions](../../security/sessions.mdx)
