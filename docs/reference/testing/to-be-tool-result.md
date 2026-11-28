---
description: "The tool result succeeded, and its text matches when an expected text is given."
---

# `toBeToolResult`

Passes when a tool result succeeded: it is not `isError`, and its text does not start with `Error:` (a declarative form cannot set `isError`, so it says it in words). With an argument, the result's text must also contain that string, match that RegExp or satisfy that asymmetric matcher.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
expect(await tools.call("add_to_cart", { qty: 2 })).toBeToolResult();
expect(result).toBeToolResult("Added 2 × Field Mug");
expect(result).toBeToolResult(/2 × Field Mug/);
```

## Options

`expect(received).toBeToolResult(expected?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `expected` | `string \| RegExp \| asymmetric matcher` | none | What the result's text contains (a string), matches (a RegExp) or satisfies. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## Notes

A failure says whether the call failed (with its code) or which text it answered instead:

```text
expect(received).toBeToolResult(/2 ×/)

  The call succeeded, but its text does not match.
  Expected: /2 ×/
  Text:     "Added 1 × Field Mug"
```

Given anything that is not a tool result (a string, `null` after a navigation), it fails with a sentence saying it needs the result from `callTool()` or `tools.call()`, negated or not.

## See also

- [`toBeToolError`](./to-be-tool-error.md)
- [`callTool`](./call-tool.md)
- [The `tools` fixture](./tools.md)
