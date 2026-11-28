---
description: "The run's answer contains or matches the expected text."
---

# `toHaveAnswered`

Passes when the run's answer (the text it replied with) contains this string, matches this RegExp or satisfies this asymmetric matcher. On a [`mockAdapter`](./mock-adapter.md), its last top-level run's answer: a sub-agent's run on the same adapter is not it, and a run that streamed no text has none.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(run).toHaveAnswered("Back in your cart.");
expect(run).toHaveAnswered(/back in your cart/i);
```

## Options

`expect(received).toHaveAnswered(expected)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `expected` | `string \| RegExp \| asymmetric matcher` | required | What the answer contains, matches or satisfies. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A run that failed has no answer: the failure says how it ended instead.

## See also

- [`toHaveFinishedWith`](./to-have-finished-with.md)
