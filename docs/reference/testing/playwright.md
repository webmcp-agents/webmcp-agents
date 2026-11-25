---
description: "Drive a page's WebMCP tools from Playwright, the way an agent would."
---

# `openApp, runTool, listTools, parkedOn, confirm`

Playwright helpers that drive the page's tools through `window.agent`, which the devtools install in development builds: run e2e against `vite dev` or a build with the devtools on. Use `test.use({ reducedMotion: "reduce" })` so the cursor snaps.

## Import

```ts
import { confirm, listTools, openApp, parkedOn, runTool } from "@webmcp-agents/testing/playwright";
```

## Example

<include meta='title="e2e/flights.spec.ts"'>/_examples/testing/e2e/flights.spec.ts</include>

## Options

`openApp(page, path, options?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `timeout` | `number` | Playwright's expect timeout | How long `openApp` waits for `window.agent` and the tools. |

## Returns

`openApp`: once tools are registered. `runTool`: the tool's text answer (`Error [code]: …` for a failure), undefined after a navigation. `listTools`: the names, sorted. `parkedOn`: once the cursor is parked on the control. `confirm`: `parkedOn`, then a real click.

## Notes

The entry needs `@playwright/test`: importing it without it fails with a sentence naming it.

## See also

- [`toHaveParked`](./to-have-parked.md)
- [The Field Store example](../../examples/field-store.mdx)
