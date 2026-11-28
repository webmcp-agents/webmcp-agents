---
description: "A tool run started, for the named tool when one is given."
---

# `toHaveStarted`

Reads an event log (the [`events`](./events.md) fixture, [`recordEvents()`](./helpers.md), or an array of `AgentEvent`). Passes when a `start` event is there, for `tool` when given.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(events).toHaveStarted("place_order");
expect(events).not.toHaveStarted("add_to_cart");
```

## Options

`expect(received).toHaveStarted(tool?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `tool` | `string` | any tool | The tool's name. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure lists the events that did happen, numbered, in words (`1. start place_order`, `2. fill qty = "2" (place_order)`).

## See also

- [`toHaveEventOrder`](./to-have-event-order.md)
- [`onAgentEvent`](../core/on-agent-event.md)
