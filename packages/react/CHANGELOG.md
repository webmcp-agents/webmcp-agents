# @webmcp-agents/react

## 0.3.0

### Patch Changes

- Updated dependencies [[`2c75ea5`](https://github.com/webmcp-agents/webmcp-agents/commit/2c75ea5f62e2a18e1e74f0dce7fb39a21786df82), [`7d491df`](https://github.com/webmcp-agents/webmcp-agents/commit/7d491df776898c48bf0a80203aa6ca99e539aa68)]:
  - @webmcp-agents/core@0.3.0
  - @webmcp-agents/devtools@0.3.0

## 0.2.0

### Minor Changes

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - One way to write a tool: `execute`, plus an optional `target`. Nothing is added to the markup for the cursor.
  
  - core: a tool's control is found by role and name, like a person would: its `target` (now a locator `{ role, name, within }`, a CSS selector, or a function of the input returning either or the element), else an element marked `toolname="<id>"`, else the button, link, tab, menu item or switch named like the tool's `title` (or its id read as words). `locate` and `ToolLocator` are exported.
  - core: a tool with an `inputSchema` shows its call on the page: the cursor types each value into the control whose `name` is the parameter or whose label matches it (closest to the tool's control), before it clicks or parks. `fields` points a parameter elsewhere or turns it off; `fill(values)` runs after the typing for what cannot be typed (a custom select). Text is typed a character at a time; a number, date, range or native select is written once; a checkbox or radio is toggled by a click; a custom widget is visited, never written. Without the visuals, under reduced motion or with a yielded cursor, the values are still written, in one step. `fill` events are emitted for tools too.
  - core: the input is validated before anything moves; invalid input never reaches the page.
  - core: a `requireConfirmation` tool found by name needs exactly one matching control; with none or several the call fails with a hint instead of running unconfirmed.
  - core: flags in plain words, `readOnly`, `destructive`, `repeatable`, `external`, `safeResponse`, become the WebMCP annotations at registration (merged with `annotations`).
  - core: `tool.invoke(input)` calls a tool the way an agent would (cursor, typing, confirmation) and resolves to what `execute` returned.
  - core: `match` on a tool (a path pattern, several, or a RegExp) says where it is on. `createWebAgents({ tools, availableTools, visuals })` registers an object (or array) catalog, follows the browser's URL itself (the Navigation API, else `history`, plus back/forward and hash changes; `watchPathname` is exported) and returns `setAvailableTools`, `setTools`, `destroy`. Two tools with one id throw, naming both keys.
  - core: `registerWebTool` also takes a function returning the tool, for a definition that changes while it stays registered.
  - core: a tool that is not `readOnly` and finds no control says so once in the development console.
  - core: declarative forms: a number, date or range field is now written in one step instead of a character at a time.
  - react: `<WebAgentsProvider tools availableTools visuals>` is a thin wrapper over `createWebAgents`: `tools` is an object, `availableTools` lists tools by reference or by key, and `match` tools follow the URL with nothing wired to a router. The array catalog, `global`, `routes`, `pathname` and `context` keep working as before.
  - react: `useWebTool({ … })` takes the definition itself (or a defined tool) and returns `{ invoke, registered, supported }`. Calls read the latest render's `execute`, `target`, `fields` and `fill`.
  - react: `usePathname` follows `history.pushState` / `replaceState` in browsers without the Navigation API as well.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - Initial release: the agent cursor and visual layer (core), a document.modelContext polyfill, React bindings,
  devtools, a chat widget with a cloud agent, and an on-device agent.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The provider installs the devtools in development. `<WebAgentsProvider devtools>` takes `boolean | ProviderDevtoolsOptions`, default `true`: when `process.env.NODE_ENV === "development"` (`vite dev`, `next dev`, `astro dev`, webpack's development mode) it loads `@webmcp-agents/devtools` with a dynamic `import()` and installs the floating panel (Alt+Shift+A, `window.agent`) wired to its own cursor, so the Settings switches work. The check sits literally around the `import()`, so bundlers drop it from production builds: no devtools chunk is emitted. Tests (`NODE_ENV=test`) get no panel either. `devtools={false}` turns it off; an object passes panel options (`initialOpen`, `hotkey`, `initialSettings`, `eventClient`). One panel per page however many providers mount; StrictMode's remount keeps it.
  
  - `@webmcp-agents/react`: the `devtools` prop and the `ProviderDevtoolsOptions` type. `@webmcp-agents/devtools` is now a dependency and `react-dom` a peer. To move on, delete your own development-only `installWebAgentsDevtools()` effect or lazy `<WebAgentsDevtools />` and uninstall `@webmcp-agents/devtools` (an app that keeps its own install gets a warning pointing at `devtools={false}`).
  - `@webmcp-agents/devtools`: no longer depends on `@webmcp-agents/react` (not even as an optional peer); `<WebAgentsDevtools />`, the TanStack plugin and `installWebAgentsDevtools()` default `visuals` to the started provider's or `createWebAgents`' cursor through core's `currentAgentVisuals()`. They stay for pages without the provider and for placing the panel by hand (with `devtools={false}`).
  - `@webmcp-agents/core`: new `currentAgentVisuals()`. `agents.visuals.setSpotlight` / `setYieldToUser` called before the cursor installs (the polyfill still loading) now become its starting options instead of being dropped. `createWebAgents` does not install the devtools (they are built on core): a page without React calls `installWebAgentsDevtools()` after it.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The provider loads the WebMCP polyfill itself. `createWebAgents({ polyfill })` and `<WebAgentsProvider polyfill>` take `"auto" | false`, default `"auto"`: where the browser has no `document.modelContext`, they load the polyfill with a dynamic `import()` (a chunk of its own that browsers with WebMCP never download) and install it, in production too, so visitors in Firefox and Safari get the tools, the cursor and the chat. `polyfill: false` never loads it, for a site that wants native WebMCP only.
  
  Registrations wait instead of being dropped: a tool registered through `createWebAgents`, the provider or `useWebTool` (any `registerWebTool`) while the polyfill loads registers once it is there, in order, and unregistering before then cancels it. The cursor installs first. So the "render nothing until the polyfill has loaded" gate goes away: pages render inside the provider on first paint, Server Components included. A tool registered with no polyfill coming still warns once.
  
  - `@webmcp-agents/core`: the polyfill moves in, as `@webmcp-agents/core/polyfill` (`installWebMCPPolyfill`, `PolyfillModelContext`) and the side-effect `@webmcp-agents/core/polyfill/auto`. New `loadWebMCPPolyfill()` (load it only where needed, once per page) and `whenModelContext(listener)` (run once the page has `document.modelContext`), and the `PolyfillOption` type.
  - `@webmcp-agents/react`: `<WebAgentsProvider polyfill>`; `useWebTool`'s `registered` and `supported` turn true once the polyfill is there.
  - `@webmcp-agents/polyfill`: **deprecated**. It re-exports `@webmcp-agents/core/polyfill` and `/polyfill/auto`, so existing imports keep working. To move on, uninstall it and delete the `import("@webmcp-agents/polyfill/auto")` and the "ready" state that waited for it.
  - `@webmcp-agents/devtools` and `@webmcp-agents/chat`: the panel and the chat bind to `document.modelContext` once it exists (`whenModelContext`), so they work when they start before the polyfill.

### Patch Changes

- Updated dependencies [[`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`d5126c6`](https://github.com/webmcp-agents/webmcp-agents/commit/d5126c67cab8360b488dd5ba71250dab529facf1), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`da60d2d`](https://github.com/webmcp-agents/webmcp-agents/commit/da60d2d7db94abfc7b07773597f9d7f93aeb46fd), [`0a20fa6`](https://github.com/webmcp-agents/webmcp-agents/commit/0a20fa6c9194b3faacafc10a91d5b91c371fdc2a), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624)]:
  - @webmcp-agents/devtools@0.2.0
  - @webmcp-agents/core@0.2.0
