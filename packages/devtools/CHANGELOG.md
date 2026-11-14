# @webmcp-agents/devtools

## 0.3.0

### Patch Changes

- Updated dependencies [[`2c75ea5`](https://github.com/webmcp-agents/webmcp-agents/commit/2c75ea5f62e2a18e1e74f0dce7fb39a21786df82), [`7d491df`](https://github.com/webmcp-agents/webmcp-agents/commit/7d491df776898c48bf0a80203aa6ca99e539aa68)]:
  - @webmcp-agents/core@0.3.0

## 0.2.0

### Minor Changes

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - Call an agent from code, and see in the devtools what the cursor will do.
  
  - chat: every agent from `defineWebAgent` has `agent.invoke(text, { adapter?, signal?, onStep? })`, which runs it on the page with no chat and resolves to `{ text, steps, messages }`. The agent stays plain data a server imports: `invoke` loads the browser loop on its first call and rejects on the server.
  - chat: `useWebAgent(agent, { adapter? })` → `{ invoke, stop, status, steps, text, error }`, with `status` "idle", "running", "waiting" (a tool parked on the person's click) or "error". `invoke` never rejects.
  - chat: `defineWebAgent({ tools })` also takes tool objects (`[tools.getCart, "list_orders"]`).
  - chat: the adapter defaults to one shared `createCloudAdapter()`: `<AgentChat agent={shopper} />` needs no `adapter` prop.
  - chat: `useAgentSession`, `useAgentChat`, `<AgentChat>`, `useWebAgent` and `agent.invoke` run one shared loop; the page's tool list is now also refreshed while the model thinks.
  - devtools: each tool shows its resolved control ("button · Add to cart", "none: runs unseen", "3 matches", "depends on the call"), the field each parameter would be typed into, its `match` and whether the current path fits, and its flags as badges. Catalog tools whose `match` does not fit are listed as "off here". Locate goes to the control the cursor would use, with no `toolname` needed. The list follows the page (URL changes and rendered controls), not only tool changes.
  - devtools: `window.agent.invoke(name, args)` is the console helper (`agent.run` stays, the same function); "Copy as" writes `agent.invoke(…)` (`toAgentInvokeCode`; `toAgentRunCode` is a deprecated alias).
  - core: `inspectTools()` lists every WebTool on the page (registered, and the catalog tools of each started `createWebAgents`) with the controls and fields the cursor would use and whether its `match` fits.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - Initial release: the agent cursor and visual layer (core), a document.modelContext polyfill, React bindings,
  devtools, a chat widget with a cloud agent, and an on-device agent.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The provider installs the devtools in development. `<WebAgentsProvider devtools>` takes `boolean | ProviderDevtoolsOptions`, default `true`: when `process.env.NODE_ENV === "development"` (`vite dev`, `next dev`, `astro dev`, webpack's development mode) it loads `@webmcp-agents/devtools` with a dynamic `import()` and installs the floating panel (Alt+Shift+A, `window.agent`) wired to its own cursor, so the Settings switches work. The check sits literally around the `import()`, so bundlers drop it from production builds: no devtools chunk is emitted. Tests (`NODE_ENV=test`) get no panel either. `devtools={false}` turns it off; an object passes panel options (`initialOpen`, `hotkey`, `initialSettings`, `eventClient`). One panel per page however many providers mount; StrictMode's remount keeps it.
  
  - `@webmcp-agents/react`: the `devtools` prop and the `ProviderDevtoolsOptions` type. `@webmcp-agents/devtools` is now a dependency and `react-dom` a peer. To move on, delete your own development-only `installWebAgentsDevtools()` effect or lazy `<WebAgentsDevtools />` and uninstall `@webmcp-agents/devtools` (an app that keeps its own install gets a warning pointing at `devtools={false}`).
  - `@webmcp-agents/devtools`: no longer depends on `@webmcp-agents/react` (not even as an optional peer); `<WebAgentsDevtools />`, the TanStack plugin and `installWebAgentsDevtools()` default `visuals` to the started provider's or `createWebAgents`' cursor through core's `currentAgentVisuals()`. They stay for pages without the provider and for placing the panel by hand (with `devtools={false}`).
  - `@webmcp-agents/core`: new `currentAgentVisuals()`. `agents.visuals.setSpotlight` / `setYieldToUser` called before the cursor installs (the polyfill still loading) now become its starting options instead of being dropped. `createWebAgents` does not install the devtools (they are built on core): a page without React calls `installWebAgentsDevtools()` after it.

### Patch Changes

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The provider loads the WebMCP polyfill itself. `createWebAgents({ polyfill })` and `<WebAgentsProvider polyfill>` take `"auto" | false`, default `"auto"`: where the browser has no `document.modelContext`, they load the polyfill with a dynamic `import()` (a chunk of its own that browsers with WebMCP never download) and install it, in production too, so visitors in Firefox and Safari get the tools, the cursor and the chat. `polyfill: false` never loads it, for a site that wants native WebMCP only.
  
  Registrations wait instead of being dropped: a tool registered through `createWebAgents`, the provider or `useWebTool` (any `registerWebTool`) while the polyfill loads registers once it is there, in order, and unregistering before then cancels it. The cursor installs first. So the "render nothing until the polyfill has loaded" gate goes away: pages render inside the provider on first paint, Server Components included. A tool registered with no polyfill coming still warns once.
  
  - `@webmcp-agents/core`: the polyfill moves in, as `@webmcp-agents/core/polyfill` (`installWebMCPPolyfill`, `PolyfillModelContext`) and the side-effect `@webmcp-agents/core/polyfill/auto`. New `loadWebMCPPolyfill()` (load it only where needed, once per page) and `whenModelContext(listener)` (run once the page has `document.modelContext`), and the `PolyfillOption` type.
  - `@webmcp-agents/react`: `<WebAgentsProvider polyfill>`; `useWebTool`'s `registered` and `supported` turn true once the polyfill is there.
  - `@webmcp-agents/polyfill`: **deprecated**. It re-exports `@webmcp-agents/core/polyfill` and `/polyfill/auto`, so existing imports keep working. To move on, uninstall it and delete the `import("@webmcp-agents/polyfill/auto")` and the "ready" state that waited for it.
  - `@webmcp-agents/devtools` and `@webmcp-agents/chat`: the panel and the chat bind to `document.modelContext` once it exists (`whenModelContext`), so they work when they start before the polyfill.
- Updated dependencies [[`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`d5126c6`](https://github.com/webmcp-agents/webmcp-agents/commit/d5126c67cab8360b488dd5ba71250dab529facf1), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`da60d2d`](https://github.com/webmcp-agents/webmcp-agents/commit/da60d2d7db94abfc7b07773597f9d7f93aeb46fd), [`0a20fa6`](https://github.com/webmcp-agents/webmcp-agents/commit/0a20fa6c9194b3faacafc10a91d5b91c371fdc2a), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624)]:
  - @webmcp-agents/core@0.2.0
