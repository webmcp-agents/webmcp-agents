---
description: "Says whether a form control's value must never be shown or read out: passwords, payment and one-time-code fields, and anything marked data-agent-sensitive."
---

# `isSensitiveControl`

Says whether a form control's value must never be shown or read out. The cursor checks it for every field it types into. For such a field, the `fill` event's value, the live region and the spoken text show `"••••"`, and the field's previous value (`from`) is withheld, so chat restore leaves it as it is. The field itself always gets the real value.

## Import

```ts
import { isSensitiveControl } from "@webmcp-agents/core/redact";
```

## Example

```html
<input name="promo" data-agent-sensitive />
<div data-agent-sensitive><input name="member-number" /></div>
<input name="card" autocomplete="cc-number" />
```

All three are sensitive: the first two by the marker, on the control or on an ancestor, the third by its `autocomplete`, with no attribute needed.

## Options

`isSensitiveControl(el)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `el` | `Element` | required | The control. |

## Returns

`true` for `type="password"`, an `autocomplete` of `current-password`, `new-password`, `one-time-code` or any payment token (`cc-number`, `cc-csc`, `cc-exp`, `cc-name`…), or a control that is marked `data-agent-sensitive` or sits inside an element that is. `false` otherwise, and for anything that is not an element (on a server there is no DOM).

## Notes

- A tool can mark a parameter instead, with [`sensitive`](./define-web-tool.md#options), or its schema can, with `x-sensitive: true` or `format: "password"`. The cursor masks a field when either says so.
- It is part of what the cursor loads, so it stays a single attribute selector.

## See also

- [`onAgentEvent`](./on-agent-event.md), the `fill` event
- [`@webmcp-agents/core/redact`](./redact.md)
