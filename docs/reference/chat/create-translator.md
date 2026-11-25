---
description: "A translate function over the chat's catalog: placeholders, plurals and functions, with locale-aware number, percent and byte formatting. No dependency."
---

# `createTranslator`

Returns `t`, a function that looks a key up in the chat's catalog (your overrides over English) and fills it. Use it in a
UI of your own on [`useAgentChat`](./use-agent-chat.md) (which also returns one as `t`), or anywhere the chat's words are
needed outside the chat. It has no dependency and never returns `undefined` or a key.

## Import

```ts
import { createTranslator, deepMerge, directionOf } from "@webmcp-agents/chat";
import type { ChatFormat, MessageValues, Translate } from "@webmcp-agents/chat";
```

## Example

```ts
const t = createTranslator({ tool: { running: "Working on {tool}…" } }, "en");

t("tool.running", { tool: "add_to_cart" }); // "Working on add_to_cart…"
t("steps", { count: 3 }); // "3 steps"
t.format.bytes(1.4e9); // "1.4 GB"
directionOf("ar"); // "rtl"
```

## Options

`createTranslator(messages?, locale?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `messages` | `ChatMessagesInput \| null` | `{}` | Overrides laid over English, at any depth. |
| `locale` | `string` | `"en"` | BCP 47. Drives plural rules and number formatting. An invalid tag is `"en"`. |

## Returns

A `Translate`: `t(key, values?)` returns the filled string.

| Name | Type | Description |
|---|---|---|
| `t(key, values)` | `(key: MessageKey, values?: MessageValues) => string` | The entry for `key`, filled. Missing or `null`: English. Unknown key: `""`. |
| `t.locale` | `string` | The locale in use, canonicalized (`"EN-us"` → `"en-US"`). |
| `t.messages` | `ChatMessages` | The merged catalog. |
| `t.format` | `ChatFormat` | `number(n)` ("1,234"), `percent(fraction)` ("42%"), `bytes(n)` ("380 MB", "1.4 GB"), for that locale. |

The helpers it is built on:

| Name | What it does |
|---|---|
| `deepMerge(base, override)` | `override` over `base` at any depth, taking only keys `base` has and values of a usable kind (so JSON cannot add `__proto__` or replace a group with a string). Changes neither. |
| `directionOf(locale)` | `"rtl"` for Arabic, Hebrew, Persian, Urdu and a few more; `"ltr"` otherwise (an invalid tag too). |

## Notes

- Placeholders, plurals and functions behave as in [`ChatMessages`](./chat-messages.md#notes); nothing throws.
- Create it once per catalog and locale (a `useMemo`): it builds its `Intl` formatters when created.

## See also

- [`ChatMessages`](./chat-messages.md)
- [`useAgentChat`](./use-agent-chat.md), whose `t` is one of these
