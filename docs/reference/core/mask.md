---
description: "Masks one value already known to be secret, with no traversal and no detection."
---

# `mask`

Masks one value that is already known to be secret, with no traversal and no detection. The redactor uses it for every value it replaces. Call it for a single value of your own, such as the last digits of a card in your own UI.

## Import

```ts
import { mask } from "@webmcp-agents/core/redact";
```

## Example

```ts
import { mask } from "@webmcp-agents/core/redact";

mask("4242424242424242", "partial"); // "42••••42"
mask("1234567", "partial"); // "[REDACTED]": too short to keep both ends
mask("hunter2"); // "[REDACTED]"
mask("hunter2", "full", "••••"); // "••••"
```

## Options

`mask(value, style?, token?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | required | The secret. Anything else is read as text. |
| `style` | `"full" \| "partial" \| "indexed"` | `"full"` | `"partial"` keeps the first and last two characters of a value of 12 characters or more, and fully masks a shorter one. `"indexed"` needs a redactor's scope, so here it is written as `token`. |
| `token` | `string` | `"[REDACTED]"` | What replaces the value. |

## Returns

The masked string.

## See also

- [`createRedactor`](./create-redactor.md), for values that need detection
- [`isSensitiveControl`](./is-sensitive-control.md)
