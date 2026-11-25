---
description: "The run called exactly these tools, in this order."
---

# `toHaveCalledTools`

Passes when the run called exactly these tools, in this order: no call before, between or after. Reads the same runs as [`toHaveCalledTool`](./to-have-called-tool.md).

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);
```

## Options

`expect(received).toHaveCalledTools(tools)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `tools` | `string[]` | required | The tool names, in order. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure lists both orders, points at the first call that should not be there, and prints its input:

```text
expect(received).toHaveCalledTools(["track_last_order","add_to_cart"])

  Expected tools, in order:  track_last_order → add_to_cart
  Called:                    track_last_order → add_to_cart → place_order
                                                              ^ unexpected
  place_order input: {"confirm":true}
```

## See also

- [`toHaveCalledTool`](./to-have-called-tool.md)
- [`mockAdapter`](./mock-adapter.md)
