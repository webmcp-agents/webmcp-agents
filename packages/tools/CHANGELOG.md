# @webmcp-agents/tools

## 0.3.0

### Minor Changes

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`dbbc44c`](https://github.com/webmcp-agents/webmcp-agents/commit/dbbc44cef83e03dd0d7d8e02ef2797c3ae5df48b) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - `goTo({ navigate })`: your router's navigation, for a page with no link on screen. The page changes without a page load, so the chat, the cursor and calls in flight stay.

### Patch Changes

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`dbbc44c`](https://github.com/webmcp-agents/webmcp-agents/commit/dbbc44cef83e03dd0d7d8e02ef2797c3ae5df48b) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - `go_to` and `go_back` answer once the address has changed (up to 3 s), not at the click. A client router such as Next.js changes it a moment later; answering first let a chat send its next step before the new page's tools had registered, so the agent could not use them. When the address never changes, `go_to` says so instead of "Opened".
- Updated dependencies [[`2c75ea5`](https://github.com/webmcp-agents/webmcp-agents/commit/2c75ea5f62e2a18e1e74f0dce7fb39a21786df82), [`7d491df`](https://github.com/webmcp-agents/webmcp-agents/commit/7d491df776898c48bf0a80203aa6ca99e539aa68)]:
  - @webmcp-agents/core@0.3.0

## 0.2.0

### Minor Changes

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - New package: common WebMCP tools, ready-made. `getTime()`, `getLocation()`, `getPage()`, `goTo({ pages })`, `goBack()`, `scrollTo()` and `setTheme({ get?, set? })` each return a `defineWebTool` tool (`get_time`, `get_location`, `get_page`, `go_to`, `go_back`, `scroll_to`, `set_theme`) to put in your catalog. Framework-free, SSR-safe and tree-shakeable: `go_to` clicks the page's own link (so any client router handles it) and falls back to `location.assign`; `set_theme` presses the site's theme switch, else calls `set`; `get_location` needs no lookup service (pass `lookup` for city, region and country). Every factory takes `{ id?, description? }`.

### Patch Changes

- Updated dependencies [[`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`d5126c6`](https://github.com/webmcp-agents/webmcp-agents/commit/d5126c67cab8360b488dd5ba71250dab529facf1), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`da60d2d`](https://github.com/webmcp-agents/webmcp-agents/commit/da60d2d7db94abfc7b07773597f9d7f93aeb46fd), [`0a20fa6`](https://github.com/webmcp-agents/webmcp-agents/commit/0a20fa6c9194b3faacafc10a91d5b91c371fdc2a), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624)]:
  - @webmcp-agents/core@0.2.0
