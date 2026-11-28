---
description: "These event types happened in this order, others allowed between them."
---

# `toHaveEventOrder`

Passes when the listed event types happened in this order. Other events may come between (several `fill`s, a `yield`): the list is checked as a subsequence.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(events).toHaveEventOrder(["start", "fill", "park", "result"]);
```

## Options

`expect(received).toHaveEventOrder(order)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `order` | `string[]` | required | Event types: `start`, `fill`, `park`, `result`, `error`, `cancel`, `yield`, `resume`. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure prints both orders and the step where they part:

```text
Expected, in order:  start → result → park
Happened:           start → fill → fill → park → yield → result
```

## See also

- [`toHaveStarted`](./to-have-started.md)
- [`onAgentEvent`](../core/on-agent-event.md)
