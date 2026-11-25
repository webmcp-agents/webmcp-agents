---
description: "Every AgentEvent from the start of the test, with helpers."
---

# `events`

The `events` fixture: an `EventLog` of every `AgentEvent` the visual layer emitted since the test started. Recording stops after it. The event matchers read it.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ events }) => {});
```

## Example

```ts
expect(events).toHaveFilled("qty", "2");
expect(events).toHaveEventOrder(["start", "fill", "result"]);
expect(events.of("park")).toHaveLength(0);
```

## Options

The `EventLog`'s members. [`recordEvents()`](./helpers.md) returns the same shape outside the fixture.

| Name | Type | Default | Description |
|---|---|---|---|
| `events` | `AgentEvent[]` | — | The events so far (the array grows while recording). |
| `types` | `() => string[]` | — | Their types, in order. |
| `of` | `(type) => AgentEvent[]` | — | The events of one type, typed. |
| `clear` | `() => void` | — | Forget what was recorded; keep recording. |
| `stop` | `() => void` | — | Stop recording (the fixture does it after the test). |

## Returns

An `EventLog`.

### Also exported

- `AgentEventOf<K>`: the `AgentEvent` of one type (`AgentEventOf<"fill">`).
- `isEventLog(value)`: true for a log made by `recordEvents` (the `events` fixture is one).

## See also

- [`onAgentEvent`](../core/on-agent-event.md)
- [`toHaveParked`](./to-have-parked.md)
