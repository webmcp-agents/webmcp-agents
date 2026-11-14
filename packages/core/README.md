# @webmcp-agents/core

Show the person using a page what a WebMCP agent is doing: a ghost cursor that glides to the tool, types the agent's
values, clicks, and parks on a submit button while the browser waits for confirmation. It's driven entirely by WebMCP
lifecycle events, so **tools don't know it exists**, and it gets out of the way the moment the person moves.

The package also holds the tool model the other `@webmcp-agents/*` packages share: `defineWebTool` (a tool is `execute`
plus an optional `target`, with `fields`, `fill`, `match`, flags and `invoke`), `locate` (a control by role and name),
`createWebAgents` (put an app's tools on a page without a framework), a ref-counted tool registry, error codes for tool
results, a cross-browser `executeTool`, and the WebMCP types.

```sh
pnpm add @webmcp-agents/core
```

```ts
import { installAgentVisuals, onAgentEvent } from "@webmcp-agents/core";
import "@webmcp-agents/core/cursor.css";

// Before your app renders, so tools register through it.
const visuals = installAgentVisuals({ spotlight: true });

onAgentEvent((e) => console.debug("[agent]", e)); // start, fill, park, result, error, cancel, yield, resume
```

`cursor.css` imports in any bundler (Vite, Next.js with Turbopack, Astro). An optional second stylesheet,
`@webmcp-agents/core/cursor-native.css`, outlines Chrome's native `:tool-form-active` / `:tool-submit-active` states; it
is only useful on a page that runs native WebMCP without the visuals, and Turbopack refuses its pseudo-classes.

Nothing is added to the page's markup for the cursor: it finds the control a tool acts on by role and accessible name (the
tool's `title`, or its id read as words), or by the tool's `target`, and types each parameter into the field with that
`name` or label. A tool with no control on the page runs unseen; a confirm-gated one needs exactly one.

```ts
import { createWebAgents, defineWebTool } from "@webmcp-agents/core";

const clearCart = defineWebTool({
  id: "clear_cart",
  title: "Clear cart", // the button the cursor parks on
  description: "Empty the cart. The user confirms on the page.",
  destructive: true, // a flag: becomes the WebMCP hint destructiveHint
  requireConfirmation: true,
  execute: () => cart.clear(),
});

const listOrders = defineWebTool({
  id: "list_orders",
  description: "List past orders, newest first.",
  readOnly: true,
  match: "/orders", // on only while the path matches
  execute: () => cart.orders,
});

// Installs the cursor and follows the browser's URL itself: no router wiring.
const agents = createWebAgents({ tools: { clearCart, listOrders } });
agents.setAvailableTools([clearCart]);

await clearCart.invoke(); // call it the way an agent would: the cursor moves, confirmation applies
```

`toolname="<id>"` markers, CSS-selector targets and declarative `<form toolname>` tools still work.

`createWebAgents` loads a `document.modelContext` polyfill itself where the browser has no WebMCP (option
`polyfill`, default `"auto"`; `false` for native WebMCP only), as a chunk of its own that browsers with WebMCP never
download, and tools registered before it is there wait for it. A page that registers tools without `createWebAgents`
calls `loadWebMCPPolyfill()`, or imports `@webmcp-agents/core/polyfill` (`installWebMCPPolyfill`) or the side-effect
`@webmcp-agents/core/polyfill/auto`.

Bundle budgets (min+gz, `pnpm --filter @webmcp-agents/core size`): the visuals alone (`installAgentVisuals`,
`onAgentEvent`) 10.4 KB (measured 10.38 KB); the whole package 18.3 KB (measured 18.27 KB). The polyfill chunk (2.45 KB)
is loaded on demand and not counted.

## Docs

- [How it works](https://github.com/mustafaskyer/web-agents/blob/main/docs/concepts/how-it-works.mdx): why tools never know the cursor exists
- [The agent cursor](https://github.com/mustafaskyer/web-agents/blob/main/docs/concepts/agent-cursor.mdx): options, yielding, confirmation, spotlight, styling
- [Tools](https://github.com/mustafaskyer/web-agents/blob/main/docs/build/define-a-tool.mdx) and [Errors](https://github.com/mustafaskyer/web-agents/blob/main/docs/concepts/errors.mdx)
- [Using it without React](https://github.com/mustafaskyer/web-agents/blob/main/docs/(get-started)/installation/no-framework.mdx): `createWebAgents`
- [Browsers without WebMCP](https://github.com/mustafaskyer/web-agents/blob/main/docs/more/polyfill.mdx): the polyfill it loads
- [API reference](https://github.com/mustafaskyer/web-agents/blob/main/docs/reference/core/README.md)
