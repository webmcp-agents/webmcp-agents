---
description: "Vitest's test, extended with the kit's fixtures."
---

# `test`

Vitest's `test`, extended with the kit's fixtures through `test.extend`: [`tools`](./tools.md), [`events`](./events.md), [`user`](./user.md), [`mount`](./mount.md), [`redactor`](./redactor.md), [`runs`](./runs.md) and [`spans`](./spans.md). Vitest sets up only the fixtures a test destructures, so a Node test that destructures none pays for no browser fixture.

## Import

```ts
import { expect, test } from "@webmcp-agents/testing";
```

## Example

<include meta='title="confirmation.browser.test.tsx"'>/_examples/testing/confirmation.browser.test.tsx</include>

## Options

`test(name, fn, options?)`, with every modifier of Vitest's `test` (`skip`, `only`, `each`, `fails`…).

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | The test's name. |
| `fn` | `(fixtures) => unknown` | required | The test. Destructure the fixtures it needs: `async ({ tools, events }) => …`. |
| `options` | `number \| TestOptions` | Vitest's | A timeout or Vitest's test options, as for `test`. |

## Returns

A Vitest `TestAPI` with the fixtures typed (`WebAgentsFixtures`). The entry also re-exports `expect`, `vi`, `describe` and the hooks, and registers the matchers on import.

## Notes

Fixtures must be destructured in the test's first parameter (`async ({ tools }) => …`): that is how Vitest knows which to set up.

### Vitest's own functions

The entry re-exports `expect`, `vi`, `describe`, `beforeAll`, `beforeEach`, `afterAll` and `afterEach` from Vitest, so a test file imports everything from one place.

## See also

- [`webAgentsProject`](./web-agents-project.md)
- [`setup`](./setup.md)
