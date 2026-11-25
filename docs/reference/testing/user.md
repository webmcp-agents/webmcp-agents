---
description: "Trusted input in a browser-mode test: confirm, moveOn, scroll, click, type."
---

# `user`

The `user` fixture: the person at the page, as trusted input (Playwright through `vitest/browser`). The cursor yields to the person and a confirmation goes on only for them, and both look at `isTrusted`: a `dispatchEvent` never counts.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ user }) => {});
```

## Example

<include meta='title="confirmation.browser.test.tsx"'>/_examples/testing/confirmation.browser.test.tsx</include>

## Options

The `FakeUser`'s methods. `fakeUser()` builds one outside the fixture.

| Name | Type | Default | Description |
|---|---|---|---|
| `confirm` | `(name?: string) => Promise<void>` | — | Click the control a confirmation waits on (`[data-agent-active]`), or the button or link named `name`. |
| `moveOn` | `() => Promise<void>` | — | A click away from every control: cancels a waiting confirmation. |
| `scroll` | `(deltaY?: number) => Promise<void>` | `200` | Scroll with the mouse wheel. |
| `click` | `(target) => Promise<void>` | — | Click an element or a locator. |
| `type` | `(target, text) => Promise<void>` | — | Type into it, key by key (`{Enter}` presses Enter). |

## Returns

A `FakeUser`.

## Notes

Browser mode only: in Node the fixture fails with a sentence saying so.

## See also

- [`toHaveParked`](./to-have-parked.md)
- [`toHaveYielded`](./to-have-yielded.md)
