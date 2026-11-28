---
description: "Returns the page's (or the server process's) redactor, which every library sink uses."
---

# `getRedactor`

Returns the page's redactor in a browser, or the process's on a server. Every library sink uses it: the devtools log, the chat's tool card, URLs and console lines leaving the page. It has the default rules until [`configureRedaction`](./configure-redaction.md) sets others. Use it to pass your own data through the same rules before you log or send it.

## Import

```ts
import { getRedactor } from "@webmcp-agents/core/redact";
```

## Example

Log an agent's tool calls with the page's rules applied:

```ts
import { onAgentEvent } from "@webmcp-agents/core";
import { getRedactor } from "@webmcp-agents/core/redact";

onAgentEvent((e) => {
  if (e.type === "start") console.log(e.tool, getRedactor()(e.args, { kind: "tool-input" }));
});
```

## Options

None: `getRedactor()` takes no arguments.

## Returns

The current [`Redactor`](./create-redactor.md#returns). It is created with the defaults on first use and kept on `globalThis`, so two copies of the package on one page share it.

## Notes

- Read it where you use it, not once at start-up: a later `configureRedaction` replaces it.

## See also

- [`configureRedaction`](./configure-redaction.md)
- [`createRedactor`](./create-redactor.md)
- [`@webmcp-agents/core/redact`](./redact.md)
