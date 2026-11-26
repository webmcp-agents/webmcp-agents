---
description: "Builds a redactor: a function that returns a redacted deep copy of any value, plus helpers for text, URLs, headers and errors."
---

# `createRedactor`

Builds a redactor: a function that returns a redacted deep copy of any value, with helpers for text, URLs, headers and errors. With no options it uses the library's defaults: sensitive field names, emails, card numbers, JWTs, bearer credentials and provider API keys all become `"[REDACTED]"`. Most apps never call it: the library uses the page's redactor ([`getRedactor`](./get-redactor.md)), and [`configureRedaction`](./configure-redaction.md) takes the same options. Call it for data of your own that leaves the page, such as a log line or an analytics event.

## Import

```ts
import { createRedactor } from "@webmcp-agents/core/redact";
```

## Example

```ts
import { createRedactor } from "@webmcp-agents/core/redact";

const redact = createRedactor({ keys: (d) => [...d, "loyaltyId"] });

redact({ email: "a@x.com", authToken: "t", tokenCount: 12 });
// { email: "[REDACTED]", authToken: "[REDACTED]", tokenCount: 12 }
redact.url("https://user:pw@shop.test/reset?token=abc#top");
// "https://shop.test/reset?token=[REDACTED]"
```

## Options

`createRedactor(options?)`. Every option is optional; the defaults are on.

| Name | Type | Default | Description |
|---|---|---|---|
| `keys` | `string[] \| (defaults) => string[]` | `DEFAULT_SENSITIVE_KEYS` | Field names whose value is always redacted. A function extends the defaults, a list replaces them. Names are compared after lowercasing and dropping everything but letters and digits (`"Api-Key"` → `"apikey"`). A key matches when its last word or words equal an entry (`authToken`, `user_api_key`, `cardNumber`, `card_pin`). An entry of five letters or more also matches at the end of a run-together name (`accesstoken`, `userpassword`). So `timespan`, `japan`, `spin` and `tokenCount` are kept. |
| `allowKeys` | `string[]` | `[]` | Names never redacted by name (`"tokenCount"`, `"sessionCount"`): they win over `keys`, but not over a tool's own `sensitive` fields, which the page cannot unmask. Their values are still scanned. |
| `patterns` | `false \| Record<string, boolean \| PatternRule>` | email, card, jwt, bearer, secretKey on; phone, iban off | Value detectors run on every string. The card detector checks Luhn, so a 16-digit order number is kept. `secretKey` finds `sk-…`, `ghp_…` and `AKIA…` keys. `true` or `false` turns one on or off, a `PatternRule` (`{ pattern, label, validate?, style? }`) replaces one or adds one under a new name, and `false` turns them all off. |
| `paths` | `string[]` | `[]` | Exact paths whose value is redacted, `*` standing for one segment: `"output.*.address"`. A tool's input sits under `input` and its result under `output` (the call's `kind`). JSON inside a string continues the string's path, and a WebMCP result's envelope is transparent: the JSON in `content[n].text` and the `structuredContent` object both sit right under `output`, so `output.shipping.address` matches either. |
| `allowQuery` | `string[]` | `[]` | Query parameters whose values are kept in URLs. |
| `style` | `"full" \| "partial" \| "indexed"` | `"full"` | `"partial"` keeps the first and last two characters of a long value (`"42••••42"`). `"indexed"` writes a stable token per distinct value within one scope (`"[EMAIL_1]"`, `"[EMAIL_2]"`), so a trace still shows which steps used the same value. |
| `token` | `string` | `"[REDACTED]"` | What a redacted value becomes. |
| `maxDepth` | `number` | `8` | Objects nested deeper than this become `"[Truncated]"`. |
| `maxStringLength` | `number` | `8192` | Longer strings are cut (ending in `…`), then scanned, so a huge value takes bounded time. |
| `custom` | `(value, { key, path, kind, tool }) => unknown` | — | The last word on a value under a key (never the root value). Return `undefined` to keep the library's result, anything else to use it as it is. If it throws, the value is redacted. |

## Returns

A `Redactor`: call it as `redact(value, { kind?, tool?, sensitive? })` for a redacted deep copy. `sensitive` adds field names for this call only (a tool's `sensitive` fields). It never mutates its input and never throws. A cycle reads `"[Circular]"`, and a value that cannot be read (a getter that throws) reads as the token.

| Member | Description |
|---|---|
| `text(value)` | One string, scanned. JSON inside it is parsed, redacted by key and written back; JSON that needs no change comes back exactly as written (formatting, big integers). |
| `url(value, { for? })` | Credentials dropped, origin and path kept, the query rebuilt as written. `for: "log"` (default) drops the hash and redacts every query value outside `allowQuery`. `for: "model"` redacts only parameters that are sensitive by name or by value, and keeps the hash (a hash router's route), its query treated the same way. Anything that is not an absolute http(s) URL or a path starting with `/` is scanned as text. |
| `headers(value)` | `authorization`, `cookie`, `set-cookie` and other sensitive names redacted; every other value scanned. |
| `error(value)` | A loggable line from anything thrown: its message only, scanned (provider errors can echo an API key). |
| `extend(options)` | A new redactor with these options over this one's. A `keys` function receives this one's keys. |
| `scope()` | The same rules with fresh `"indexed"` numbering: one scope per run or trace. |

`DEFAULT_SENSITIVE_KEYS` lists the default names: `password`, `passwd`, `passphrase`, `secret`, `token`, `apikey`, `accesskey`, `privatekey`, `credential(s)`, `authorization`, `cookie`, `setcookie`, `session`, `sessionid`, `jwt`, `ssn`, `cvv`, `cvc`, `cardnumber`, `pan`, `iban`, `passport`, `pin`, `otp`.

## Notes

- Every repetition in the built-in detectors is bounded, so no input makes them backtrack without end. A rule's pattern without the `g` flag is used as if it had it, so every match is replaced.
- A `validate` that throws redacts the match: a failing rule never leaks.
- A `Map`, `Set` or class instance comes back as its own enumerable fields (usually `{}`). An `Error` becomes its redacted message. A `Date`, a `BigInt` or a function is kept as it is.

## See also

- [`@webmcp-agents/core/redact`](./redact.md), where the library applies it
- [`configureRedaction`](./configure-redaction.md)
- [`mask`](./mask.md)
