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
| `usage` | `boolean` | `true` | Report each step's token usage on its `step-finish` part, as the cloud adapter does when the server sends it: the step's `usage`, or `{ inputTokens: 10, outputTokens: 5 }`. `false` reports none, like an on-device adapter. |
| `model` | `string` | `"mock/model"` | The model id each `step-finish` reports, with `usage`. |

## Returns

A `MockAdapter`: the adapter, with `run` as a spy, `requests` (each with its messages copied, the tools offered and the run's `ref`: `conversation`, `run`, `parent` for a sub-agent's run), `lastSignal` and `calls`.

## Notes

The steps:

| Step | Does |
|---|---|
| `text(content, { chunks?, delayMs?, usage? })` | Answers `content` (word by word, or in `chunks` pieces) and ends the run. `usage`: `{ inputTokens?, outputTokens?, reasoningTokens?, cachedInputTokens? }`. |
| `toolCall(name, input?, { id? })` | Calls the tool; the run goes on. Ids are `call-<n>`. |
| `reasoning(content)` | Reasoning kept with the step: merge it, `[reasoning("…"), toolCall("x")]`. |
| `fail(code, message?)` | The run ends with `error` and `code` (`rate_limited`, `network`, `chat_disabled`, `bad_request`). |

An agent's `maxSteps` ends a run with `max-steps`. A script that runs out fails the run with a sentence saying so.

Each step streams like the cloud adapter's: `step-start`, `message-start`, its reasoning and text, its `tool-call`s, then
`step-finish` (with usage), and only then are the calls run (`tool-result`). So [run events](../chat/on-agent-run.md)
from a mock run come in the same order as from a real one.

## See also

- [`toHaveCalledTools`](./to-have-called-tools.md)
- [`mockChatServer`](./mock-chat-server.md)
- [Adapter types](../chat/adapter-types.md)
- [`runs`](./runs.md)
