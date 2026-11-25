---
description: "A model-free AgentAdapter that plays a script and remembers what it did."
---

# `mockAdapter`

An `AgentAdapter` that runs a script instead of a model: no network, no key. It owns the loop like a real adapter: a tool-call step runs the call on the page (cursor and all), then the next step follows; a step without calls answers and ends the run. The run matchers read it.

## Import

```ts
import { fail, mockAdapter, reasoning, text, toolCall } from "@webmcp-agents/testing/chat";
```

## Example

<include meta='title="agent.browser.test.tsx"'>/_examples/testing/agent.browser.test.tsx</include>

## Options

`mockAdapter(script, options?)`. `script` is a list of steps, played in order across runs, or a function `(req, { run, step })` called for every model step, which returns a step or a whole stream of parts (for behavior no step expresses, such as waiting on `req.signal`).

| Name | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | `"mock"` | The adapter's id. |
| `label` | `string` | `"Mock"` | Its label in the adapter switcher. |

## Returns

A `MockAdapter`: the adapter, with `run` as a spy, `requests` (each with its messages copied and the tools offered), `lastSignal` and `calls`.

## Notes

The steps:

| Step | Does |
|---|---|
| `text(content, { chunks?, delayMs?, usage? })` | Answers `content` (word by word, or in `chunks` pieces) and ends the run. |
| `toolCall(name, input?, { id? })` | Calls the tool; the run goes on. Ids are `call-<n>`. |
| `reasoning(content)` | Reasoning kept with the step: merge it, `[reasoning("…"), toolCall("x")]`. |
| `fail(code, message?)` | The run ends with `error` and `code` (`rate_limited`, `network`, `chat_disabled`, `bad_request`). |

An agent's `maxSteps` ends a run with `max-steps`. A script that runs out fails the run with a sentence saying so.

## See also

- [`toHaveCalledTools`](./to-have-called-tools.md)
- [`mockChatServer`](./mock-chat-server.md)
- [Adapter types](../chat/adapter-types.md)
