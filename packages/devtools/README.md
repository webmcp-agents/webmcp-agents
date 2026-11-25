# @webmcp-agents/devtools

Devtools for WebMCP pages. See which tools are live on the current screen, run them from a form generated from their
JSON Schema, and watch a timeline of every call: yours from the panel, or a real agent's. Each tool shows what the
cursor will do: the control it acts on ("button · Add to cart", "none: runs unseen", "3 matches"), the fields it
types into, its `match` and whether the current path fits, and its flags.

In a React app there is nothing to install or write: `<WebAgentsProvider>` (`@webmcp-agents/react`, which depends on
this package) installs the panel in development, wired to its cursor, and a production build has none of it.

```tsx
<WebAgentsProvider tools={catalog}>           // the panel, in development
<WebAgentsProvider tools={catalog} devtools={{ initialOpen: true }}>
<WebAgentsProvider tools={catalog} devtools={false}>   // off: place it yourself, below
```

Open it with the button in the bottom-right corner or Alt+Shift+A. From the console: `await agent.invoke("tool_name",
{ … })` (`agent.run` is the same function).

Install it yourself for a page without the provider, or to place the panel by hand:

```sh
pnpm add -D @webmcp-agents/devtools
```

```ts
// A page built on createWebAgents (core cannot load the devtools: they are built on it)
createWebAgents({ tools });
if (import.meta.env.DEV) (await import("@webmcp-agents/devtools")).installWebAgentsDevtools();
```

```tsx
// By hand, inside a provider whose own panel is off: <WebAgentsDevtools />, or the TanStack Devtools tab
<WebAgentsProvider tools={catalog} devtools={false}>
  <App />
  <WebAgentsDevtools />
</WebAgentsProvider>
```

Either way the Settings switches drive the started provider's (or `createWebAgents`') cursor, found through core's
`currentAgentVisuals()`: this package does not depend on `@webmcp-agents/react`.

## Docs

- [Debug with devtools](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/build/devtools.mdx)
- [API reference](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/devtools/README.md)
