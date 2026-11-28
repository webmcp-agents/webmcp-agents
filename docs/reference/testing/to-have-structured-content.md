---
description: "The tool result's structuredContent has these keys with these values."
---

# `toHaveStructuredContent`

Passes when a tool result's `structuredContent` has the given keys with the given values. It is a partial match: other keys may be there.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(await tools.call("cart_total")).toHaveStructuredContent({ total: 48 });
```

## Options

`expect(received).toHaveStructuredContent(expected)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `expected` | `Record<string, unknown>` | required | The keys to check and their values (compared deeply; asymmetric matchers work). |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure names each key that differs, with both values. A result without `structuredContent` says so.

## See also

- [`toBeToolResult`](./to-be-tool-result.md)
