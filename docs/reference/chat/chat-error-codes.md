---
description: "Every failure the chat can explain, as a code: what the person reads comes from the catalog by code, never from a server's English."
---

# Chat error codes

A failure reaches the chat as a code, and the chat shows the catalog's text for it (`errors[code]`), so a page in any
language explains every failure, and a 0.4.0 server (which sends fewer codes) still gets translated text. The English
`error` text travels too, for callers that are not the UI. Use `chatErrorCode` to turn any code (or none) into one the
catalog has.

## Import

```ts
import { CHAT_ERROR_CODES, chatErrorCode } from "@webmcp-agents/chat";
import type { ChatErrorCode } from "@webmcp-agents/chat";
```

## Example

```ts
chatErrorCode("rate_limited"); // "rate_limited"
chatErrorCode("forbidden_origin"); // "unknown": a server-only code
chatErrorCode(undefined); // "unknown"

const { error, t } = useAgentChat({ messages: es, locale: "es" });
// error?.text is es.errors[error.code]
```

## Options

`chatErrorCode(code)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `code` | `unknown` | required | A code from an adapter, a server, or nothing. |

The codes, and where each comes from:

| Code | When | English |
|---|---|---|
| `chat_disabled` | the endpoint has no model configured (503 `chat_disabled`) | "Chat isn't configured on this site." |
| `rate_limited` | 429 | "You're sending messages too fast. Try again in a minute." |
| `daily_limit` | 503 with `reason: "daily_budget"`, or 429 with `Retry-After` over an hour | "This demo has reached its daily limit. Try again tomorrow, or try the on-device assistant." |
| `bad_request` | 400, 413, 415 | "The assistant couldn't read this conversation. Start a new chat." |
| `network` | `fetch` threw, or the stream broke | "Couldn't reach the assistant. Check your connection and try again." |
| `session` | 401 `session_required` after the retry | "Couldn't start a chat session. Reload the page and try again." |
| `busy` | any other 503 (and the server's `unavailable`) | "The assistant is busy. Try again in a moment." |
| `max_steps` | the run reached its step limit before answering | "The assistant stopped at its step limit before finishing. Try again to let it continue." |
| `aborted` | the run was stopped (`agent.invoke`, `useWebAgent`) | "The agent run was aborted." |
| `run_failed` | the adapter threw | "The agent run failed." |
| `unknown` | anything else: another status, a model error mid-stream, no code | "Something went wrong. Try again." |

## Returns

A `ChatErrorCode`: the code itself when the catalog has it; `unknown` or `busy` for a server-only code; `unknown` for
anything else. `CHAT_ERROR_CODES` lists every catalog code.

## Notes

- **Server-only codes** (`forbidden`, `method_not_allowed`, `server_error`, `forbidden_origin`, `unavailable`) are not
  catalog keys: the person reads `unknown` (or `busy` for `unavailable`), since there is nothing different for them to
  do.
- **Derived on the page.** The cloud adapter reads the code from the status and the body, as 0.4.0 did, so a 0.4.0
  server needs no change. A model error in the middle of a reply has no code: it reads as `unknown`, and the server's
  words stay in `error.message` and the server log.
- **Not the UI.** `agent.invoke` rejects with an `Error` whose `message` is the English text and whose `code` is the
  code; `useWebAgent`'s `error` has both; an abort is a standard `AbortError`.
- **`max_steps`** is the one new visible message of 0.5.0: before, a turn cut short by the step limit just stopped. Try
  again resumes it.
- The text for the model (a tool not on the page, the tool budget, a 500's message) is the handler's:
  [`createChatHandler({ messages })`](./create-chat-handler.md#options).

## See also

- [`ChatMessages`](./chat-messages.md), `errors`
- [`useAgentChat`](./use-agent-chat.md), `error.text`
- [Adapter types](./adapter-types.md), the `error` part
