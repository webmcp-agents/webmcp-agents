---
description: "The run ended this way, with this error code when given."
---

# `toHaveFinishedWith`

Passes when the run ended with `reason`, and, with `code`, with that adapter error code.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(adapter).toHaveFinishedWith("error", "rate_limited");
expect(await agent.invoke("hi", { adapter }).catch((e) => e)).toHaveFinishedWith("error", "rate_limited");
```

## Options

`expect(received).toHaveFinishedWith(reason, code?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `reason` | `"stop" \| "max-steps" \| "aborted" \| "error"` | required | How the run ended. |
| `code` | `string` | any code | The adapter's error code: `rate_limited`, `network`, `chat_disabled`, `bad_request`. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

What each source can tell:

| Received | Reads as |
|---|---|
| a [`mockAdapter`](./mock-adapter.md) | exactly how its last top-level run ended (a sub-agent's run on the same adapter is not it): it saw the `finish` or `error` part |
| the [`runs`](./runs.md) fixture | exactly how the last top-level run ended (its `run-finish`), with the error's `code` |
| the error `agent.invoke` rejected with | `"error"` with the error's `code`, or `"aborted"` for an `AbortError` |
| a `WebAgentResult` | `"stop"`: `agent.invoke` resolved. A run cut short by `maxSteps` resolves too; to tell them apart, assert on the adapter or on `runs` |

### `FinishReason`

`"stop" | "max-steps" | "aborted" | "error"`.

## See also

- [`toHaveAnswered`](./to-have-answered.md)
- [`fail`](./mock-adapter.md#notes)
