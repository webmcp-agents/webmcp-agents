---
description: "The tool result failed, with the expected error code when one is given."
---

# `toBeToolError`

Passes when a tool result failed: `isError`, or a text that starts with `Error:` / `Error [code]:`. With a code, the failure must carry it: `structuredContent.error.code` first, else the `[code]` of the text (see [`toolError`](../core/tool-error.md)).

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(await tools.call("add_to_cart", { qty: 0 })).toBeToolError("invalid_input");
expect(await call).toBeToolError("cancelled");
expect(result).not.toBeToolError();
```

## Options

`expect(received).toBeToolError(code?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `code` | `string` | none | The error code, e.g. `"not_found"`, `"cancelled"`. Any string: an app's own codes work too. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A wrong code names both codes and prints the result's text:

```text
expect(received).toBeToolError("not_found")

  The call failed, but with code "invalid_input", not "not_found".
  Text: "Error [invalid_input]: qty must be ≥ 1"
```

## See also

- [`toBeToolResult`](./to-be-tool-result.md)
- [`toolError`](../core/tool-error.md)
