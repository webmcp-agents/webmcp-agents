---
description: "@webmcp-agents/core/redact keeps passwords, card numbers, tokens, emails and the fields an app marks out of what the library shows, logs or exports about a tool call."
---

# `@webmcp-agents/core/redact`

The redaction entry. It keeps passwords, card numbers, tokens, emails and the fields an app marks out of what the library shows, logs or exports about a tool call. It is on by default, with one set of rules per page and one per server, and nothing to configure for the common cases. It is its own chunk with no dependency. A page that never imports it pays only for the control check the cursor uses.

What it does **not** do: it reduces accidental leakage, but it is not a security boundary. A hostile script on the page can read the fields itself, and a model can repeat in prose what it was given. What the model receives is unchanged unless a tool opts in with `hideFromModel`.

## Import

```ts
import { configureRedaction, createRedactor, getRedactor } from "@webmcp-agents/core/redact";
```

## Example

Add a field name of your own to the page's rules, once, before tools run:

```ts
import { configureRedaction } from "@webmcp-agents/core/redact";

configureRedaction({ keys: (defaults) => [...defaults, "loyaltyId"] });
```

With React, pass the same options to [`<WebAgentsProvider redact>`](../react/web-agents-provider.md#props); on the server, to [`createChatHandler({ redact })`](../chat/create-chat-handler.md#options).

## Options

The entry's exports:

| Name | Description |
|---|---|
| [`createRedactor`](./create-redactor.md) | Build a redactor from options. Includes `Redactor`, `RedactOptions`, `PatternRule`, `RedactContext`, `RedactKind`, `RedactUrlOptions`, `BuiltInPattern`, `DEFAULT_SENSITIVE_KEYS`. |
| [`getRedactor`](./get-redactor.md) | The page's (or the process's) redactor, which every library sink uses. |
| [`configureRedaction`](./configure-redaction.md) | Set the page's (or the process's) rules. |
| [`mask`](./mask.md) | Mask one value already known to be secret. Includes `RedactionStyle`. |
| [`isSensitiveControl`](./is-sensitive-control.md) | Whether a form control's value must never be shown. |
| [`toolSensitivity`](./tool-sensitivity.md) | The fields a tool marks as sensitive. Includes `ToolSensitivity`, `SensitiveSource`, `SensitiveOption`. |

## Returns

Nothing at import: the entry touches no DOM and no global state until one of its functions is called, so it is safe to import on a server.

## Notes

Where the library applies the page's rules:

| Place | What happens |
|---|---|
| The cursor's `fill` event, live region and spoken text | A [sensitive control](./is-sensitive-control.md) or a `sensitive` parameter is written as `"••••"`, and its previous value (`from`) is withheld, so chat restore leaves that field as it is. The field itself gets the real value. |
| The devtools: call log, fields typed, results, "copy as code" | Redacted when recorded. "Reveal values" shows them as they were, in development builds only. |
| The chat's tool card (and the registry's `agent-tool` block) | Input, output and errors redacted. The person's own message is never changed. |
| URLs leaving the page | Logs and telemetry: every query value outside `allowQuery` is redacted. The two URLs the model reads, the page URL of a step request and the note sent when the person changed pages, lose credentials, the hash and any parameter that is sensitive by name or by value: `?from=CAI&to=LHR` reaches the model, `?token=abc` does not. |
| Console lines that print a caught value | The error's message only, redacted (the chat, the devtools, the provider). Core's own few lines print no tool data (a polyfill that failed to load, a registration error, a listener of yours that threw) and stay as they are, which keeps the cursor's bundle small. |
| Server logs, model errors | Redacted by the handler's own rules, or the process's. Request bodies are never logged. |

Not redacted, on purpose:

- **What the model receives** (tool inputs, tool results) is unchanged by default, because the model usually needs the data it asked for. A tool keeps a result field from the model with `sensitive: { output: [...], hideFromModel: true }`: the page and the person still get the value, while the model and the stored conversation get `"[REDACTED]"`.
- **[`onAgentEvent`](./on-agent-event.md) listeners** get `args` and `result` exactly as in 0.4.0. Only a `fill`'s `value` is masked.

## See also

- [`defineWebTool`](./define-web-tool.md#options), the `sensitive` option
- [`<WebAgentsProvider redact>`](../react/web-agents-provider.md#props)
- [`createChatHandler`](../chat/create-chat-handler.md#options), the server's own rules
- [`redactToolCall`](../chat/redact-tool-call.md), the tool card's view of a call
