---
description: "The chat in Arabic and Spanish: complete catalogs, each its own entry, so a page ships only the ones it imports."
---

# Locales

Complete catalogs for the chat besides the built-in English: `ar` (Arabic, with its six plural forms) and `es`
(Spanish). Each is its own package entry, so a page that does not import one does not ship it. Use one as
[`messages`](./agent-chat.md#props) with the matching `locale`, and spread your own words over it.

## Import

```ts
import { ar } from "@webmcp-agents/chat/locales/ar";
import { es } from "@webmcp-agents/chat/locales/es";
```

## Example

```tsx
// dir="rtl" comes from the locale
<AgentChat locale="ar" messages={{ ...ar, title: "مساعد المتجر" }} />
```

## Options

Each entry exports one `ChatMessages`, named like the file.

| Name | Type | Default | Description |
|---|---|---|---|
| `ar` | `ChatMessages` | | Arabic. Pass `locale="ar"` (or a region, `"ar-EG"`) for Arabic plurals, digits and right-to-left layout. |
| `es` | `ChatMessages` | | Spanish. Pass `locale="es"`. |

## Notes

- `locale` and `messages` are separate on purpose: the catalog is the words; `locale` drives plural rules, number,
  byte and percent formatting, and the direction. A locale with no catalog formats numbers in that locale and keeps
  English words.
- Every catalog is written with `satisfies ChatMessages`, so a key the chat adds is a type error until it is translated.
- To add a language, copy `en` ([`ChatMessages`](./chat-messages.md#every-key)) and translate it; keep every
  `{placeholder}`.

## See also

- [`ChatMessages`](./chat-messages.md)
- [`createTranslator`](./create-translator.md)
