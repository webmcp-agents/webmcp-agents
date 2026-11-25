# @webmcp-agents/polyfill

> **Deprecated.** The `document.modelContext` polyfill now ships in `@webmcp-agents/core`, and `<WebAgentsProvider>`
> and `createWebAgents` load it themselves where the browser has no WebMCP. This package re-exports it, so existing
> imports keep working.

To move on, uninstall this package and delete the `import("@webmcp-agents/polyfill/auto")` and any "ready" state that
waited for it:

```sh
pnpm remove @webmcp-agents/polyfill
```

A page that registers tools without the provider imports the same entries from core:

| Was | Now |
|---|---|
| `import { installWebMCPPolyfill, PolyfillModelContext } from "@webmcp-agents/polyfill"` | `… from "@webmcp-agents/core/polyfill"` |
| `import "@webmcp-agents/polyfill/auto"` | `import "@webmcp-agents/core/polyfill/auto"`, or `await loadWebMCPPolyfill()` from `@webmcp-agents/core` to load it only where it is needed |

## Docs

- [Browsers without WebMCP](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/more/polyfill.mdx): what it covers, how the provider loads it, and how it differs from Chrome
- [API reference](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/polyfill/README.md)
