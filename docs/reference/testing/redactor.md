---
description: "A fresh page redactor per test, reset after it."
---

# `redactor`

The `redactor` fixture: calls `configureRedaction({})` before the test, hands over the page's redactor, and resets it after, so a test that configures redaction leaves the next one the defaults.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ redactor }) => {});
```

## Example

```ts
test("masks a password", ({ redactor }) => {
  expect(redactor({ password: "hunter2" })).toEqual({ password: "[REDACTED]" });
});
```

## Options

What the test receives.

| Name | Type | Default | Description |
|---|---|---|---|
| `redactor` | `Redactor` | the defaults | The page's redactor after `configureRedaction({})`. Call [`configureRedaction`](../core/configure-redaction.md) in the test to change the rules; the fixture resets them after it. |

## Returns

A `Redactor`: [`getRedactor()`](../core/get-redactor.md) after the reset.

## See also

- [`@webmcp-agents/core/redact`](../core/redact.md)
- [`toContainSensitive`](./to-contain-sensitive.md)
