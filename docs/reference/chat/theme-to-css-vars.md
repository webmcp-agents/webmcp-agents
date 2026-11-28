---
description: "A chat theme as --wa-chat-* CSS variables, for a page without React or server-rendered HTML."
---

# `themeToCssVars`

Turns a [`ChatTheme`](./chat-theme.md) into its `--wa-chat-*` CSS variables. Use it where the theme is not a prop: a
page without React, or server-rendered HTML that should paint the right colors on its first frame.

## Import

```ts
import { themeToCssVars } from "@webmcp-agents/chat";
import type { ChatCssVar } from "@webmcp-agents/chat";
```

## Example

```ts
const vars = themeToCssVars({ color: { accent: "#e11d48" } });
// { "--wa-chat-color-accent": "#e11d48" }

for (const [name, value] of Object.entries(vars)) {
  document.documentElement.style.setProperty(name, value);
}
```

In JSX, the object is a valid `style`: `<body style={themeToCssVars(theme)}>`.

## Options

`themeToCssVars(theme)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `theme` | `ChatTheme` | required | One theme. For `{ light, dark }`, convert each and apply it under your own condition, or pass the pair to `<AgentChat theme>`. |

## Returns

`Record<ChatCssVar, string>`: one entry per theme key that is a token and has a usable value. Numbers become strings.

## Notes

- A key that is not a token is ignored. A value holding `;`, `{`, `}`, `!` or a line break is dropped: it could end the
  declaration and write another property. It never throws (`null` gives `{}`).
- The chat reads the variables at its root, so setting them on any ancestor (`:root`, `body`) works.

## See also

- [`ChatTheme`](./chat-theme.md), every key and its default
- [`defineChatTheme`](./define-chat-theme.md)
