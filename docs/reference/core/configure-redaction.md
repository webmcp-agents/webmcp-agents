---
description: "Sets the page's (or the server process's) redaction rules; every library sink follows them from the next value on."
---

# `configureRedaction`

Sets the page's redaction rules, or the process's on a server. Every library sink follows them from the next value on: the devtools log and its "copy as code", the chat's tool card, URLs and console lines leaving the page, server logs. With React, [`<WebAgentsProvider redact>`](../react/web-agents-provider.md#props) calls it for you.

## Import

```ts
import { configureRedaction } from "@webmcp-agents/core/redact";
```

## Example

```ts
import { configureRedaction } from "@webmcp-agents/core/redact";

configureRedaction({
  keys: (defaults) => [...defaults, "loyaltyId"],
  allowQuery: ["page", "sort"],
});
```

## Options

`configureRedaction(options)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `options` | `RedactOptions \| Redactor` | required | The [options of `createRedactor`](./create-redactor.md#options), or a redactor you built. `{}` restores the defaults. |

## Returns

Nothing.

## Notes

- A second call replaces the first: options are not merged. To build on the current rules, pass `getRedactor().extend({ … })`.
- A sink reads the rules when it writes, so a call made after a tool already ran applies to the next call, not to what was already logged.
- The page and the server are separate: [`createChatHandler({ redact })`](../chat/create-chat-handler.md#options) gives a handler its own rules, whatever the process configured.

## See also

- [`getRedactor`](./get-redactor.md)
- [`createRedactor`](./create-redactor.md)
- [`@webmcp-agents/core/redact`](./redact.md)
