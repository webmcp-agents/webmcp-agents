---
description: "Finds a control on the page the way a person, or a Testing Library query, does: by its role and the name on it."
---

# `locate`

Finds a control on the page the way a person, or a Testing Library query, does: by its role and the name on it. It is how a tool's cursor knows where to go without anything added to the markup, and you can use it yourself, in a function [`target`](./define-web-tool.md#where-the-cursor-goes) or anywhere you need "the button called Remove Ocean Tee".

## Import

```ts
import { locate } from "@webmcp-agents/core";
import type { FieldTarget, ToolLocator } from "@webmcp-agents/core";
```

## Example

Three lookups, and a tool whose `target` picks one button per call.

<include meta='title="locate-controls.ts"'>/_examples/shared/reference/core/locate.ts</include>

## Options

`locate(locator)` takes a `ToolLocator`, every part optional. With no part it matches any control.

| Name | Type | Default | Description |
|---|---|---|---|
| `role` | `string` | any role | The ARIA role to look for: `button`, `link`, `tab`, `menuitem`, `switch`, `checkbox`, `radio`, `textbox`, `searchbox`, `spinbutton`, `slider`, `combobox`, `listbox`, or any explicit `role` attribute. Native elements have theirs (see the notes). |
| `name` | `string \| RegExp` | any name | The accessible name. A string compares trimmed, with whitespace collapsed and case ignored; an exact match beats a name that only starts with it. A RegExp is tested against the name as shown. |
| `within` | `string \| Element` | the whole document | Only look inside this element, or inside the first match of this selector. For the same name in two places (a cart drawer and a page). |

### `FieldTarget`

Where one parameter is typed: the values of a tool's [`fields`](./define-web-tool.md#options). `ToolLocator | string | false`:

| Value | Meaning |
|---|---|
| a `ToolLocator` | The control to type into. |
| a `string` | A label's text: the same as `{ name: "…" }`, among the roles a value goes into: `textbox`, `searchbox`, `spinbutton`, `slider`, `combobox`, `listbox`, `checkbox`, `radio`, `switch`. |
| `false` | Never type that parameter (it still reaches `execute`). |

## Returns

The first usable control that matches, in document order, as an `Element`, or `null`. Where several match, exact names win: the controls named exactly `name` when there are any, else the ones whose name starts with it. A tool uses the same rule, and a confirm-gated tool additionally requires that exactly one control matches.

## Notes

- **Roles.** The explicit `role` attribute wins. Otherwise a role comes from the element: `<button>` and `<summary>` are `button`, `<a href>` is `link`, `<select>` is `combobox`, `<textarea>` is `textbox`, and an `<input>` is its type's role (`submit`, `reset`, `image` and `button` are `button`; `checkbox`; `radio`; `range` is `slider`; `number` is `spinbutton`; `search` is `searchbox`; `hidden` has none; any other type is `textbox`). Only `button`, `a[href]`, `input`, `select`, `textarea`, `summary` and elements with a `role` attribute are candidates, which covers the Radix and Base UI widgets shadcn/ui renders.
- **Names**, in order: `aria-labelledby`, `aria-label`, the control's `<label>` (for or wrapping), `placeholder`, its text (not for `<select>` or `<textarea>`; an image inside counts by its `alt`, and parts marked `aria-hidden="true"` or `hidden`, such as an icon font's ligature, are left out), `alt`, `title`, and for a button its `value`. This is a small purpose-built matcher, not the full accessible-name algorithm: it covers the sources interfaces actually use.
- **Usable.** Only controls a person could use right now count: rendered and visible, not `:disabled` or `aria-disabled="true"`, not inside an `inert` or `aria-hidden="true"` part of the page, and not inside library UI (an element marked [`data-web-agents-ui`](./ui-host-attr.md), such as the devtools or the chat).
- **Icon-only buttons need an `aria-label`**, or they have no name to find. A translated UI uses a function `target` that returns the translated name.
- **Finding a field.** Without a `fields` entry, a parameter's field is searched from the tool's control outward, one ancestor at a time, so the closest wins: a control whose `name` attribute is the parameter (for radios, the one whose `value` is the parameter's value), else one labelled with the schema's `title` for the parameter, else one labelled with the parameter read as words (`firstName` is "first Name", compared without case). With no control to start from, nothing is inferred: name the field in `fields`.
- Nothing touches the DOM at import, and it needs a DOM to run: call it from an event handler, an effect or a tool, not during server rendering.

## See also

- [Define a tool](../../build/define-a-tool.mdx#how-the-cursor-finds-the-control), where the cursor goes
- [`defineWebTool`](./define-web-tool.md)
- [`inspectTools`](./inspect-tools.md)
- [`UI_HOST_ATTR`](./ui-host-attr.md)
