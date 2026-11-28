---
description: "A message-catalog override, typed where it is written: the identity function, for autocomplete and a type check."
---

# `defineChatMessages`

Returns the overrides it is given, typed as a `ChatMessagesInput` (a partial [`ChatMessages`](./chat-messages.md) at any
depth). Use it where you write the chat's words outside the JSX, so the editor completes the keys and a function's
values are typed.

## Import

```ts
import { defineChatMessages } from "@webmcp-agents/chat";
```

## Example

```ts chat-messages.ts
export const messages = defineChatMessages({
  title: "Field Store assistant",
  composer: { placeholder: "Ask about an order" },
  tool: { running: ({ tool }) => `Working on ${tool}…` },
  errors: { rate_limited: "Too many messages. Give it a minute." },
});
```

## Options

`defineChatMessages(messages)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `messages` | `ChatMessagesInput` | required | Any part of the catalog. Missing keys stay English. |

## Returns

`messages`, unchanged, with its literal type.

## See also

- [`ChatMessages`](./chat-messages.md), every key
- [`defineChatTheme`](./define-chat-theme.md)
