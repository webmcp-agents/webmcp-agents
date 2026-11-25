---
description: "The agent's value went into a field, with the expected value when one is given."
---

# `toHaveFilled`

Passes when a `fill` event went into `field` (a form control's `name`, or the parameter a tool's value was typed into), and, when `value` is given, with that value. Values compare as they are, or as text: `"2"` matches `2`.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(events).toHaveFilled("qty", "2");
expect(events).toHaveFilled("email");
```

## Options

`expect(received).toHaveFilled(field, value?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `field` | `string` | required | The field's name. |
| `value` | `unknown` | any value | The value it got. A sensitive field's value is `"••••"` in events. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure names the values the field got instead, or says no fill went into it and lists the events.

## See also

- [`toHaveEventOrder`](./to-have-event-order.md)
- [`isSensitiveControl`](../core/is-sensitive-control.md)
