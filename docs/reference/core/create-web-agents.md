---
description: "The framework-free way to put an app's tools on a page."
---

# `createWebAgents`

The framework-free way to put an app's tools on a page. It installs the agent cursor, registers every catalog tool that is available and whose `match` fits the current path, and keeps that true as the visitor navigates, following the browser's URL itself. Where the browser has no WebMCP it loads the polyfill first. [`<WebAgentsProvider>`](../react/web-agents-provider.md) is a thin wrapper over it; use it directly from Astro pages, Vue, Svelte or a plain script.

## Import

```ts
import { createWebAgents } from "@webmcp-agents/core";
import type { WebAgents, WebAgentsOptions } from "@webmcp-agents/core";
```

Load the cursor's stylesheet once beside it, from your entry or layout:

```ts
import "@webmcp-agents/core/cursor.css";
```

## Example

A two-tool catalog. `get_cart` is on every page; `list_orders` only while the URL is `/orders`. Everything an agent does is shown by the cursor.

<include meta='title="web-agents.ts"'>/_examples/shared/reference/core/create-web-agents.ts</include>

## Options

`createWebAgents(options)` takes a `WebAgentsOptions`.

| Name | Type | Default | Description |
|---|---|---|---|
| `tools` | `WebToolCatalog` | required | Everything the app has, as an object (`{ getCart, listOrders }`) or an array. A tool cannot be listed twice: two with one id throw, naming both (`tools.getCart` and `tools.cart`). See [`WebToolCatalog`](#webtoolcatalog). |
| `availableTools` | `AvailableTools` | every tool of `tools` | What an agent may use right now, when that depends on your state (signed in, a plan, a feature flag). A tool's `match` still applies on top. See [`AvailableTools`](#availabletools). |
| `visuals` | `AgentVisualsOptions \| false` | `{}` | Options for the agent cursor, read when it installs. `false` installs nothing: tools still register, without animation. See [`installAgentVisuals`](./install-agent-visuals.md). |
| `context` | `() => unknown` | not said | Read on every call and passed to `execute` as `ctx.context`. For apps written before tools closed over their own state; new code does not need it. |
| `polyfill` | `"auto" \| false` | `"auto"` | Where the browser has no `document.modelContext` (Firefox, Safari, Chrome without WebMCP), `"auto"` loads the [polyfill](./load-webmcp-polyfill.md), a chunk of its own that browsers with WebMCP never download; the cursor and the tools wait for it. In production too, so every visitor gets the tools and the chat. `false` never loads it: tools then register only where the browser has WebMCP, and elsewhere `registerWebTool` warns once. Read on `start()`. |
| `start` | `boolean` | `true` | `false`: do nothing until `start()` is called (no listeners, no cursor, no registration). For a framework binding that creates this during a render it may throw away. |

### `WebToolCatalog`

`Readonly<Record<string, WebTool>> | readonly WebTool[]`. An object lets code refer to `tools.getCart` and lists a tool once; an array is the same without keys. A key may be used in `availableTools`.

### `AvailableTools`

`readonly (WebTool | string)[]`. Each entry is a tool by reference (`tools.getCart`), by its key in an object catalog, or by its id.

## Returns

A `WebAgents` handle:

| Name | Type | Description |
|---|---|---|
| `setAvailableTools(tools)` | `(tools: AvailableTools \| undefined) => void` | Change what an agent may use right now; `undefined` for every catalog tool. A tool that leaves is released once its call in flight is answered. |
| `setTools(tools)` | `(tools: WebToolCatalog) => void` | Swap the catalog. Only tools whose definition changed re-register. |
| `destroy()` | `() => void` | Stop: no more URL tracking, every tool released (each after its call in flight is answered), the cursor removed a moment later. `start()` before then picks up where it left, without re-registering anything. |
| `start()` | `() => void` | Start (again). Called for you unless `start: false` was passed. Does nothing on the server or when already started. |
| `setPathname(pathname)` | `(pathname: string \| undefined) => void` | Match tools against this path instead of the browser's URL, for a router's own idea of the path; `undefined` to follow the URL again. |
| `registry` | `ToolRegistry` | The [registry](./create-tool-registry.md) behind it: enable a catalog tool by hand while a part of the page is on screen (`registry.enable([id])`). |
| `visuals` | `Pick<AgentVisuals, "setSpotlight" \| "setYieldToUser">` | Change the cursor's spotlight and yielding at runtime. Before the cursor installs (the polyfill still loading) a change becomes its starting option; with `visuals: false` it does nothing. [`currentAgentVisuals()`](./current-agent-visuals.md) returns this object to UI that has no handle on it. |

### `getRegisteredWebTool`

`getRegisteredWebTool(id)` returns the live `WebTool` for an id on this page (registered, else a started catalog), or `undefined`. Chat restore uses it to call optional [`revert`](./define-web-tool.md). Empty on the server.

```ts
import { getRegisteredWebTool } from "@webmcp-agents/core";

const tool = getRegisteredWebTool("add_to_cart");
await tool?.revert?.(input, { signal, source: "chat", output });
```

## Notes

- **A tool is on when it is available and its `match` fits the path.** No `match` means every page. A tool that stops matching is released only after a call in flight is answered, so turning a tool off never cancels a call still answering ([Tool lifecycle](../../concepts/tool-lifecycle.mdx)).
- **It follows the URL itself.** The Navigation API where the browser has it, else `history.pushState` / `replaceState` patched for as long as someone watches, plus `popstate` and `hashchange`; see [`watchPathname`](./watch-pathname.md). Full page loads (Astro, classic sites) simply start again. A hash route (`#/orders`) counts as the path `/orders`; a plain `#anchor` does not.
- **`match` turns a tool on as soon as the URL changes, which can be before the new route has rendered.** A tool must not assume the page's own state is there yet: do not read what the page sets in a mount effect. Write what a tool needs before you navigate (Skyline stores a search before it navigates to the results).
- **URL-change notices are delivered just after the navigation call returns**, once per burst, not inside it: Next.js changes the URL inside a React insertion effect, where telling React (a store listener, a tool registering) is an error.
- The cursor is installed before the first tool registers, so tools are animated without any ordering rule in your app.
- **Without WebMCP, `start()` loads the polyfill and the tools wait for it.** The cursor installs and the catalog registers once `document.modelContext` exists, and a tool registered meanwhile (`registerWebTool`, `useWebTool`) registers then too, in the order it came; one released before then never registers. The page itself never waits. With native WebMCP nothing is loaded and everything registers at once.
- Throws on a duplicate tool id. On the server, and until `start()`, it returns the same object and does nothing: no DOM access at import, safe in SSR.
- `destroy()` is deferred a macrotask for the cursor, so a restart in the same tick (React StrictMode) changes nothing.
- **It does not install the devtools**, unlike `<WebAgentsProvider>` in development: `@webmcp-agents/devtools` is built on this package, so this package cannot load it. A page built on `createWebAgents` adds one line after it in development, [`installWebAgentsDevtools()`](../devtools/install-web-agents-devtools.md), whose Settings then drive this cursor.

## See also

- [Tools across your app](../../build/tools-across-your-app.mdx), the page that teaches it
- [Install without a framework](<../../(get-started)/installation/no-framework.mdx>)
- [`defineWebTool`](./define-web-tool.md)
- [`watchPathname`](./watch-pathname.md)
- [`createToolRegistry`](./create-tool-registry.md)
- [`loadWebMCPPolyfill`](./load-webmcp-polyfill.md), what `polyfill: "auto"` calls
- [Browsers without WebMCP](../../more/polyfill.mdx)
- [`<WebAgentsProvider>`](../react/web-agents-provider.md)
