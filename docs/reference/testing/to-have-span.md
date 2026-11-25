---
description: "The spans include one with this name and these attributes (telemetry, 0.5.0)."
---

# `toHaveSpan`

Passes when the spans include one named `name` with these attributes. It arrives with `@webmcp-agents/telemetry` (0.5.0): until then it is typed and registered, and calling it fails with a sentence saying so.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(spans).toHaveSpan("execute_tool add_to_cart", {
  "webmcp.tool.confirm": "accepted",
});
```

## Options

`expect(received).toHaveSpan(name, attributes?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | The span's name. |
| `attributes` | `Record<string, unknown>` | none | Attributes it must have. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## See also

- [`toBeOneTrace`](./to-be-one-trace.md)
- [The `spans` fixture](./spans.md)
