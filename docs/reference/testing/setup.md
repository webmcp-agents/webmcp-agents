---
description: "The browser setup file: polyfill, reduced motion, deterministic ids, cleanup and leak checks."
---

# `@webmcp-agents/testing/setup`

A `setupFiles` entry for browser-mode tests ([`webAgentsProject("browser")`](./web-agents-project.md) lists it). A test needs no setup or cleanup of its own.

## Import

```ts
import "@webmcp-agents/testing/setup"; // in setupFiles
```

## Example

```ts
// vitest.config.ts
webAgentsProject("browser", {
  setupFiles: ["@webmcp-agents/testing/setup"], // the default
});
```

## Options

It takes no arguments; the project passes it one setting.

| Name | Type | Default | Description |
|---|---|---|---|
| `motion` | `"reduced" \| "full"` | `"reduced"` | Read from the project's `provide` (set by `webAgentsProject`'s `motion`). |

## Returns

Nothing: it registers hooks.

## Notes

What it does:

| When | What |
|---|---|
| Once | Registers the matchers, installs the WebMCP polyfill (Playwright's Chromium has none), forces `prefers-reduced-motion: reduce` so the cursor snaps (unless the project's `motion` is `"full"`), installs a deterministic id source (`u-1`, `a-1`, `call-1`…). |
| Before each test | Starts ids over; empties `sessionStorage` and `localStorage` (so a conversation the chat saved does not carry into the next test); remembers which tools are registered. |
| After each test | Unmounts what `mount` and `vitest-browser-react` rendered, removes fixtures, then fails the test if a call it started is still running or a tool it registered is still registered, naming the tool, and cleans both up. |

A call that is about to answer gets a second; a tool a provider releases after its grace period gets two. Tools a `beforeAll` registered belong to the file, not the test. A page without WebMCP ("no polyfill" tests) uses `@webmcp-agents/testing/matchers` alone.

## See also

- [`webAgentsProject`](./web-agents-project.md)
- [`test`](./test.md)
