---
description: "A tool call as a UI shows it to the person: input, output and error through the page's redaction rules, with the tool's sensitive fields masked."
---

# `redactToolCall`

Returns a tool call as a UI should show it to the person: its input, output and error passed through the page's redaction rules ([`configureRedaction`](../core/configure-redaction.md)), with the tool's own [`sensitive`](../core/define-web-tool.md#options) fields masked. The chat's tool card and the registry's `agent-tool` block use it. Use it in a tool card of your own.

## Import

```ts
import { redactToolCall } from "@webmcp-agents/chat";
```

## Example

```tsx
const shown = redactToolCall({ name: part.toolName, input: part.input, output: part.output });

return <pre>{JSON.stringify(shown.input, null, 2)}</pre>;
```

## Options

`redactToolCall(call)`. `call` is a `ToolCallView`:

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | The tool's name. Its `sensitive` fields are read from the tool registered on the page under that name. |
| `input` | `unknown` | — | The arguments the agent sent. |
| `output` | `unknown` | — | The result: a WebMCP result, or any value. JSON in its text is redacted by key. |
| `error` | `string` | — | An error message, scanned. |

## Returns

A `ToolCallView` with the same fields, redacted. A field that was `undefined` stays so. It never throws.

## Notes

- Display only: the call itself, and what the model received, are not changed. To keep a result field from the model, the tool sets `sensitive: { output: [...], hideFromModel: true }`.
- The person's own messages are never redacted: they are shown as typed.

## See also

- [`<AgentChat>`](./agent-chat.md)
- [`@webmcp-agents/core/redact`](../core/redact.md)
