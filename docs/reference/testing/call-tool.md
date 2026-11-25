---
description: "Call a tool the way an agent would and get the result it would read."
---

# `callTool`

Calls a tool and resolves to its MCP result (`{ content, isError?, structuredContent? }`), the value the tool matchers read. A tool's failure is a result, never a rejection.

## Import

```ts
import { callTool } from "@webmcp-agents/testing";
```

## Example

<include meta='title="tool.test.ts"'>/_examples/testing/tool.test.ts</include>

## Options

`callTool(tool, input?, options?)`: `tool` is a name (through `document.modelContext`) or a `defineWebTool` tool (through the page when it is registered there, else its schema and `execute` in-process).

| Name | Type | Default | Description |
|---|---|---|---|
| `signal` | `AbortSignal` | none | Cancels the call; the promise rejects with an `AbortError`. |

## Returns

`Promise<ModelContextToolResult | null>`: null when the call navigated the page away.

## Notes

By name it needs a page with WebMCP; with the tool object it also runs in Node, with no page and no cursor. A schema error is an `invalid_input` result, a `WebToolError` keeps its code.

## See also

- [`toBeToolResult`](./to-be-tool-result.md)
- [`tool.invoke`](../core/define-web-tool.md)
