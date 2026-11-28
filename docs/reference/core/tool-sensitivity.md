---
description: "Reads the fields a tool marks as sensitive: its sensitive option plus the schema's x-sensitive and format: password properties."
---

# `toolSensitivity`

Reads the fields a tool marks as sensitive: its [`sensitive`](./define-web-tool.md#options) option, plus every property its input schema marks `x-sensitive: true` or `format: "password"`, at any depth. The devtools and the chat use it to know which fields to mask and which to keep from the model. Use it in your own sink, such as a logger or an analytics hook, to treat a tool's fields the same way.

## Import

```ts
import { toolSensitivity } from "@webmcp-agents/core/redact";
```

## Example

```ts
import { getRegisteredWebTool } from "@webmcp-agents/core";
import { getRedactor, toolSensitivity } from "@webmcp-agents/core/redact";

const marked = toolSensitivity(getRegisteredWebTool("book_trip"));
const safe = getRedactor()(args, { kind: "tool-input", sensitive: marked.input });
```

## Options

`toolSensitivity(tool)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `tool` | `SensitiveSource \| null \| undefined` | required | A `WebTool`, its config, or anything with `sensitive` and `jsonSchema`. `undefined` (a declarative form, a tool not registered here) marks nothing. |

## Returns

A `ToolSensitivity`, with the names deduplicated:

| Field | Type | Description |
|---|---|---|
| `input` | `string[]` | The option's input names, then the schema's marked properties. A plain list (`sensitive: ["passport"]`) names fields on both sides. |
| `output` | `string[]` | Result fields, matched by name at any depth. |
| `hideFromModel` | `boolean` | The `output` fields are also replaced with `"[REDACTED]"` in what the model receives. |

## Notes

- It never throws: a schema that fails to derive counts as unmarked (the call itself reports the schema error).

## See also

- [`defineWebTool`](./define-web-tool.md#options), the `sensitive` option
- [`getRedactor`](./get-redactor.md)
