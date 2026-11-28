---
description: "The spans include one with this name (or matching it) and these attributes."
---

# `toHaveSpan`

Passes when the spans include one named `name` (exactly, or matching a RegExp) whose attributes include `attributes`, each compared like `toEqual` (asymmetric matchers work). It reads a [`memoryExporter`](./telemetry.md), the [`spans`](./spans.md) fixture, an OpenTelemetry `InMemorySpanExporter`, or an array of spans or span trees. A failure lists the spans there are, or what the closest one has.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(spans).toHaveSpan("execute_tool add_to_cart", {
  "webmcp.tool.confirm": "accepted",
});
expect(spans).toHaveSpan(/^chat /, {
  "gen_ai.usage.input_tokens": expect.any(Number),
});
```

## Options

`expect(received).toHaveSpan(name, attributes?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string \| RegExp` | required | The span's name, or a pattern for it. |
| `attributes` | `Record<string, unknown>` | none | Attributes it must have (others may be there too). |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## See also

- [`toBeOneTrace`](./to-be-one-trace.md)
- [The `spans` fixture](./spans.md)
