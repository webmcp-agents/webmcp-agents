---
description: "Register a page tool backed by a vi.fn spy."
---

# `mockTool`

Registers a page tool whose `execute` is a `vi.fn` (default: resolves `"ok"`). Every spy matcher and `mockResolvedValueOnce` work on it. The [`tools`](./tools.md) fixture's `tools.mock` unregisters it after the test.

## Import

```ts
import { mockTool } from "@webmcp-agents/testing";
```

## Example

```ts
const add = mockTool("add_to_cart", async ({ qty }) => `Added ${qty}`);
await callTool("add_to_cart", { qty: 2 });
expect(add).toHaveBeenCalledWith({ qty: 2 }, expect.anything());
add.unregister();
```

## Options

`mockTool(name, definition?, impl?)`: the `definition` is optional (`mockTool(name, impl)`).

| Name | Type | Default | Description |
|---|---|---|---|
| `description` | `string` | `"Mock tool <name>."` | What the agent reads. |
| `inputSchema` | `JSONSchema` | any object | The input's schema. |
| `annotations` | `ModelContextToolInfo["annotations"]` | none | WebMCP annotations, e.g. `{ readOnlyHint: true }`. |

## Returns

A `MockedTool`: the spy, plus `toolName` and `unregister()`.

## See also

- [The `tools` fixture](./tools.md)
- [`callTool`](./call-tool.md)
