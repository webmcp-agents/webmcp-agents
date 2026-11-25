---
description: "A chat theme, typed where it is written: the identity function, for autocomplete and a type check."
---

# `defineChatTheme`

Returns the theme it is given, typed as a [`ChatThemeInput`](./chat-theme.md). Use it where you write a theme outside
the JSX, so the editor completes its keys and a typo is a type error.

## Import

```ts
import { defineChatTheme } from "@webmcp-agents/chat";
```

## Example

```ts chat-theme.ts
export const theme = defineChatTheme({
  light: { color: { accent: "#0f62fe", bg: "#ffffff" } },
  dark: { color: { accent: "#78a9ff", bg: "#161616" } },
});
```

## Options

`defineChatTheme(theme)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `theme` | `ChatThemeInput` | required | One theme, or `{ light, dark }`. |

## Returns

`theme`, unchanged, with its literal type.

## See also

- [`ChatTheme`](./chat-theme.md)
- [`defineChatMessages`](./define-chat-messages.md), the same for the catalog
