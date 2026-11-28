---
description: "The two Vitest projects a WebMCP app needs, so a config is two lines."
---

# `webAgentsProject`

Returns one Vitest project with the kit's defaults: `"unit"` runs `*.test.*` in Node with the matchers; `"browser"` runs `*.browser.test.*` in Chromium with [`./setup`](./setup.md). Each has `extends: true`, so the root config's plugins, `resolve` and `define` apply.

## Import

```ts
import { webAgentsProject } from "@webmcp-agents/testing/vitest";
```

## Example

<include meta='title="vitest.config.ts"'>/_examples/testing/vitest.config.ts</include>

## Options

`webAgentsProject(kind, options?)`, `kind` is `"unit"` or `"browser"`.

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `"unit"` / `"browser"` | The project's name (`--project <name>`). |
| `include` | `string[]` | `**/*.test.{ts,tsx}` / `**/*.browser.test.{ts,tsx}` | Test files. |
| `exclude` | `string[]` | `[]` | Files to leave out, added to the defaults (`node_modules`, `dist`, and browser tests for `"unit"`). |
| `setupFiles` | `string[]` | the matchers / `./setup` | Setup files. A page that must stay without `document.modelContext` uses `["@webmcp-agents/testing/matchers"]`. |
| `motion` | `"reduced" \| "full"` | `"reduced"` | Browser only: `"reduced"` makes the cursor snap; `"full"` keeps the motion, for tests of the motion itself. |
| `viewport` | `{ width: number; height: number }` | `414 × 800` | Browser only: keep test targets inside it. |
| `define` | `Record<string, string>` | none | Compile-time constants, e.g. `process.env.NODE_ENV`. |
| `optimizeDeps` | `{ include?: string[] }` | React, `ai/test` when installed | Dependencies to pre-bundle: one found mid-run reloads Vite and the test. |
| `test` | `Record<string, unknown>` | none | Any other Vitest `test` option, merged last. |

## Returns

A `TestProjectInlineConfiguration` for `test.projects`.

## Notes

The browser project needs `@vitest/browser-playwright` (and `playwright install chromium` once): without it, it fails with a sentence naming the package. It serves `@webmcp-agents/testing` unbundled (its entries load optional peers with a top-level await).

### Types

- `WebAgentsProjectKind`: `"unit"` (`*.test.*` in Node) or `"browser"` (`*.browser.test.*` in Chromium).
- `MotionSetting`: `"reduced"` (the default: the cursor snaps) or `"full"` (the page's own setting).

## See also

- [`setup`](./setup.md)
- [`test`](./test.md)
