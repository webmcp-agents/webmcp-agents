---
description: "Every model step of the mock adapter was offered these tools."
---

# `toHaveBeenOfferedTools`

Reads a [`mockAdapter`](./mock-adapter.md), which records the tools offered on every model step. Passes when every step was offered each listed tool (others may be offered too), or when every step's names satisfy the asymmetric matcher.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(adapter).toHaveBeenOfferedTools(["search_products", "add_to_cart"]);
expect(adapter).toHaveBeenOfferedTools(expect.not.arrayContaining(["place_order"]));
```

## Options

`expect(received).toHaveBeenOfferedTools(expected)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `expected` | `string[] \| asymmetric matcher` | required | Tools each step was offered, or a matcher over each step's names. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure names the first step that was not offered them, what it was offered, and what was missing.

## See also

- [`mockAdapter`](./mock-adapter.md)
- [`defineWebAgent`](../chat/define-web-agent.md), the `tools` option
