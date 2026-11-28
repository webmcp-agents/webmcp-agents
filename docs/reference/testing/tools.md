---
description: "The page's tools as an agent reaches them: call, list, mock, settled."
---

# `tools`

The `tools` fixture: the page's tools as an agent reaches them. `call` goes through `document.modelContext` (the cursor moves, confirmations apply); `mock` registers a `vi.fn`-backed tool that is unregistered after the test.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ tools }) => {});
```

## Example

```ts
const add = tools.mock("add_to_cart", async ({ qty }) => `Added ${qty}`);
expect(await tools.call("add_to_cart", { qty: 2 })).toBeToolResult("Added 2");
expect(add).toHaveBeenCalledWith({ qty: 2 }, expect.anything());
add.mockResolvedValueOnce(toolError("unavailable", "Only 1 left."));
```

## Options

The fixture's methods.

| Name | Type | Default | Description |
|---|---|---|---|
| `call` | `(tool, input?, options?) => Promise<ModelContextToolResult \| null>` | — | [`callTool`](./call-tool.md). Never rejects for the tool's own failure. |
| `list` | `() => Promise<string[]>` | — | The names registered right now, sorted. |
| `mock` | `(name, definition?, impl?) => MockedTool` | — | [`mockTool`](./mock-tool.md), unregistered after the test. |
| `settled` | `(quietMs?) => Promise<void>` | `150` | Resolves once no `toolchange` happened for `quietMs`, e.g. after a navigation. |

## Returns

A `ToolsFixture`.

## Notes

In Node there is no page: `call` runs a `defineWebTool` tool in-process, `list` is empty.

## See also

- [`callTool`](./call-tool.md)
- [`mockTool`](./mock-tool.md)
- [`test`](./test.md)
