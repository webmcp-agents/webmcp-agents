---
description: "fixture, until, recordEvents, uniqueName, toolForm and the other small helpers."
---

# `Page helpers`

The small helpers the fixtures are built on, for tests that set up their own page.

## Import

```ts
import { echoForm, fixture, recordEvents, toolForm, uniqueName, until } from "@webmcp-agents/testing";
```

## Example

```ts
const name = uniqueName("add_to_cart"); // "add_to_cart_3"
toolForm(name, { autosubmit: false, answer: "Added." });
await until(async () => (await toolNames()).includes(name), "the tool");
const log = recordEvents();
```

## Options

The option bags of `toolForm(name, options)`, `echoForm(name, options)` and `until(check, timeout | label | options)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `fields` | `string` | a labelled `qty` number field | `toolForm`: the fields' markup. |
| `description` | `string` | `"Add mugs to the cart"` | `toolForm`: `tooldescription`. |
| `submit` | `string` | `"Add to cart"` | `toolForm`: the submit button's text. |
| `autosubmit` | `boolean` | `true` | `toolForm`, `echoForm`: submit as soon as the agent filled it; false parks on the button. |
| `answer` | `string \| (form) => string` | `"ok"` | `toolForm`: what the form answers the agent. |
| `onSubmit` | `(form) => void` | none | `toolForm`: called on every submit. |
| `prefix` | `string` | `"ok: "` | `echoForm`: put before the word in the answer. |
| `timeout` | `number` | `3000` | `until`: give up after this many ms. |
| `label` | `string` | `"condition"` | `until`: what is awaited, for the timeout message. |

## Returns

| Helper | Returns |
|---|---|
| `fixture(html)` | The mounted root (`div.test-fixture`). `cleanupFixtures()` removes them all. |
| `until(check, …)` | The ms it took; rejects after the timeout naming what it waited for. |
| `sleep(ms)` | After `ms`. |
| `recordEvents()` | An [`EventLog`](./events.md). |
| `uniqueName(base)` | `base_<n>`, new on this page. |
| `toolForm(name, …)`, `echoForm(name, …)` | The `<form>`: a declarative tool. |
| `modelContext()` | `document.modelContext`, installing the polyfill. |
| `toolNames()`, `countToolChanges()` | The registered names; a `toolchange` counter. |
| `resultText(result)` | A result's text. |
| `cursorVisible()`, `uiRoot(name)`, `byText(root, selector, text)`, `deepText(node?)` | Whether the cursor shows; a library UI's shadow root; an element by text; all text, shadow roots included. |

### Also exported

- `FIXTURE_CLASS`: `"test-fixture"`, the class every `fixture` root carries, so the cleanup finds them.
- `MockToolImpl`: what a mocked tool's implementation gets (`input`, `{ signal }`) and may return (a string, a value, or an MCP result).

## See also

- [`test`](./test.md)
- [`setup`](./setup.md)
