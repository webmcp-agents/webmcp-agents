---
description: "Mount HTML or a React element into the page; removed after the test."
---

# `mount`

The `mount` fixture: puts HTML or a React element into a fresh `div.test-fixture` and returns it. After the test, React roots are unmounted (a provider releases its tools and its cursor) and the fixtures removed.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ mount }) => {});
```

## Example

<include meta='title="agent.browser.test.tsx"'>/_examples/testing/agent.browser.test.tsx</include>

## Options

`mount(ui)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `ui` | `string \| ReactElement` | required | HTML, or a React element (`<WebAgentsProvider>…</WebAgentsProvider>`). |

## Returns

`HTMLElement`: the fixture root the UI was mounted into.

## Notes

A React element needs `react-dom`: without it, `mount(<JSX>)` fails with a sentence naming it. HTML needs nothing. Browser mode only.

## See also

- [`fixture`](./helpers.md)
- [`<WebAgentsProvider>`](../react/web-agents-provider.md)
