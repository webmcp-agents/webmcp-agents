# @webmcp-agents/chat

## 0.3.0

### Minor Changes

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`2d7f81d`](https://github.com/webmcp-agents/webmcp-agents/commit/2d7f81d846f4b11cd802734fafa4f47ec2605434) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The default system prompt says the page exposes WebMCP tools that a visible cursor performs, and asks the model to show rather than tell: use the tools that put what the user asked for on the page, step by step as a person would, and say only what the tools did. It also says the tool list is read again at every step, so a model that navigated uses the new page's tools instead of concluding from an earlier step that they are missing. The delegation note no longer asks to relay a sub-agent's answer (the chat already shows it); a delegate card no longer prints that answer a second time, and a reply that only repeats it word for word is left out.

### Patch Changes

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`428f45e`](https://github.com/webmcp-agents/webmcp-agents/commit/428f45e5b44d7a278bf8f951d6e27d3451ae4777) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - In dark mode the chat's accent is a light tint of `--agent` with dark text on it, instead of the agent's own colour: the default near-black launcher and send button were all but invisible on the dark panel. A brand colour keeps its hue. An explicit `--wa-chat-accent` for dark now needs the dark condition in its selector.

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`2d7f81d`](https://github.com/webmcp-agents/webmcp-agents/commit/2d7f81d846f4b11cd802734fafa4f47ec2605434) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - `<AgentChat>` keeps whether its panel is open in sessionStorage next to the conversation (`<storageKey>:open`), so a page load (a navigation an agent made without the app's router, a reload) brings the chat back open.

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`b14a728`](https://github.com/webmcp-agents/webmcp-agents/commit/b14a728a7cb9b9167dafdef105c80cc1ecef9306) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The server handler says why a model call failed instead of "had a problem answering": out of credits, API key rejected, unknown model, rate limited or provider down (with the provider's own message in development), and logs one readable line.

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`ca29ebc`](https://github.com/webmcp-agents/webmcp-agents/commit/ca29ebccc3a29059582a0520f135addf0a9c6f35) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The chat notices when the person changes pages themself between turns (a new path, query or hash): the next message reaches the model with a one-line note ("went from /shop to /product/… on their own"), so "add that item" means the page they are on, not the last turn's results. Turns where the page didn't move send exactly what they did before. The on-device agent ranks its tools by what the person wrote, never by that note.

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`868c746`](https://github.com/webmcp-agents/webmcp-agents/commit/868c746dbc50cbefe6a19cc11cdcdf88b4a1ca9f) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - After a tool call, the session also waits while the page is `aria-busy` (a Suspense fallback, a skeleton) before its next request, and counts the quiet time from when the loading ends (capped at 1.5 s as before). A route that streams registers its component tools only once it has rendered: the agent could reach the next step without them (`add_to_cart` on a product page opened by `open_product`).
- Updated dependencies [[`2c75ea5`](https://github.com/webmcp-agents/webmcp-agents/commit/2c75ea5f62e2a18e1e74f0dce7fb39a21786df82), [`7d491df`](https://github.com/webmcp-agents/webmcp-agents/commit/7d491df776898c48bf0a80203aa6ca99e539aa68)]:
  - @webmcp-agents/core@0.3.0

## 0.2.0

### Minor Changes

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`cd314a7`](https://github.com/webmcp-agents/webmcp-agents/commit/cd314a7c53ea6fe601f609dae0a38ac0b628d841) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - - chat: `defineWebAgent` (new `@webmcp-agents/chat/agent` entry): one agent definition (instructions, a tool subset, sub-agents, a model id, maxSteps) shared by the browser and the server. `<AgentChat agent>` / `useAgentSession(adapter, { agent })` filter the page's tools through it and run sub-agents as nested `delegate_to_<id>` runs on the same adapter. `createChatHandler({ agents })` looks agents up by id (the page never sends instructions) and runs each request with an AI SDK `ToolLoopAgent` (`toToolLoopAgent`); `prepareAgent` tunes it.
  - chat: any frontier model from one string: `model: "<provider>/<model>"` resolved by `resolveModel` with the provider's optional `@ai-sdk/*` package (anthropic, openai, google, deepseek, xai, mistral), `@openrouter/ai-sdk-provider` (`openrouter/<vendor>/<model>`), or the AI Gateway; provider-neutral `reasoning` (the Anthropic `effort` option is deprecated); GET reports `provider` and `agents`; 503s name the env var to set; tool-call provider metadata round-trips. The cloud adapter labels itself after the endpoint's model and takes an `id`. `webAgentsChatDev` forwards every `*_API_KEY`, `AI_GATEWAY_*` and `WEB_AGENTS_*` variable and takes `agents`.
  - local-agent: the page's agent (`req.agent`) wins over `createLocalAdapter({ instructions, maxSteps })`; a delegation note is added when it has sub-agents.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - Call an agent from code, and see in the devtools what the cursor will do.
  
  - chat: every agent from `defineWebAgent` has `agent.invoke(text, { adapter?, signal?, onStep? })`, which runs it on the page with no chat and resolves to `{ text, steps, messages }`. The agent stays plain data a server imports: `invoke` loads the browser loop on its first call and rejects on the server.
  - chat: `useWebAgent(agent, { adapter? })` → `{ invoke, stop, status, steps, text, error }`, with `status` "idle", "running", "waiting" (a tool parked on the person's click) or "error". `invoke` never rejects.
  - chat: `defineWebAgent({ tools })` also takes tool objects (`[tools.getCart, "list_orders"]`).
  - chat: the adapter defaults to one shared `createCloudAdapter()`: `<AgentChat agent={shopper} />` needs no `adapter` prop.
  - chat: `useAgentSession`, `useAgentChat`, `<AgentChat>`, `useWebAgent` and `agent.invoke` run one shared loop; the page's tool list is now also refreshed while the model thinks.
  - devtools: each tool shows its resolved control ("button · Add to cart", "none: runs unseen", "3 matches", "depends on the call"), the field each parameter would be typed into, its `match` and whether the current path fits, and its flags as badges. Catalog tools whose `match` does not fit are listed as "off here". Locate goes to the control the cursor would use, with no `toolname` needed. The list follows the page (URL changes and rendered controls), not only tool changes.
  - devtools: `window.agent.invoke(name, args)` is the console helper (`agent.run` stays, the same function); "Copy as" writes `agent.invoke(…)` (`toAgentInvokeCode`; `toAgentRunCode` is a deprecated alias).
  - core: `inspectTools()` lists every WebTool on the page (registered, and the catalog tools of each started `createWebAgents`) with the controls and fields the cursor would use and whether its `match` fits.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`aa76c04`](https://github.com/webmcp-agents/webmcp-agents/commit/aa76c04583d369fefb757bbb176dd5be0a150cf5) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - Harden `/api/chat` against use outside the page.
  
  - `createChatHandler({ session })`: the page's first `GET` sets a random, HMAC-signed, httpOnly `SameSite=Strict`
    session cookie (`WEB_AGENTS_SESSION_SECRET`); a `POST` without a valid one gets `401 session_required`. `verify` gates
    new sessions behind a bot check. The cloud adapter needs no change: it starts a session and retries once on that 401.
    `webAgentsChatDev` turns sessions on by default.
  - `createChatHandler({ tools })`: a server-side tool allowlist. `defineWebTool` tools are pinned (the model gets the
    server's description and schema, never the request's); tool ids allow inline component tools; anything else is
    dropped. Ids listed by registered agents are allowed too.
  - `createChatHandler({ requireAgent })` refuses requests that name no agent.
  - `beforeModel` gets `{ agent, session }`, for per-session limits.
  - The default system prompt keeps the model to the site: it declines unrelated requests in one sentence.
  - Cloudflare Turnstile for new sessions: `session: { turnstile }` (server, `TURNSTILE_SECRET_KEY`, also
    `turnstileVerify`) and `createCloudAdapter({ sessionHeaders: turnstileHeaders({ siteKey }) })` (page). The widget
    loads only when a session is needed and is invisible unless Cloudflare wants a click.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`0a20fa6`](https://github.com/webmcp-agents/webmcp-agents/commit/0a20fa6c9194b3faacafc10a91d5b91c371fdc2a) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - - core: a string `target` that matches nothing now falls back to the `[toolname]` element, for the cursor and the confirmation click. `target` is documented as rarely needed.
  - chat: `webAgentsChatDev` refuses to start when a `VITE_*` variable is named like a secret (`secretGuard`); `AdapterStatus.loading` carries `progress`; adapters can offer `models()` / `selectModel()` and the widget shows a model picker.
  - local-agent: a model already on the device loads with the status `loading`, never `downloading`; the cache check asks transformers.js (`ModelRegistry.is_pipeline_cached`) instead of a localStorage hint; `createLocalAdapter({ models, dtype })` offers several models to pick from; `MODELS` entries gain `label` and `brief`; `DEFAULT_MODEL` replaces the `DEFAULT_GPU_MODEL` / `DEFAULT_CPU_MODEL` aliases (kept, deprecated).

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - Initial release: the agent cursor and visual layer (core), a document.modelContext polyfill, React bindings,
  devtools, a chat widget with a cloud agent, and an on-device agent.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`d42d8a2`](https://github.com/webmcp-agents/webmcp-agents/commit/d42d8a24d62e676a9a7b3384b6a91724f83ad203) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - - `useAgentChat()`: the chat as a `useChat`-shaped hook with AI SDK `UIMessage`s, `ChatStatus` names, the adapter switcher, local models and `toolPhase(part)` (a call parked on the page, a sub-agent's nested run). `<AgentChat>` is now built on it. `toUIMessages` gains a `forRendering` mode.

### Patch Changes

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The provider loads the WebMCP polyfill itself. `createWebAgents({ polyfill })` and `<WebAgentsProvider polyfill>` take `"auto" | false`, default `"auto"`: where the browser has no `document.modelContext`, they load the polyfill with a dynamic `import()` (a chunk of its own that browsers with WebMCP never download) and install it, in production too, so visitors in Firefox and Safari get the tools, the cursor and the chat. `polyfill: false` never loads it, for a site that wants native WebMCP only.
  
  Registrations wait instead of being dropped: a tool registered through `createWebAgents`, the provider or `useWebTool` (any `registerWebTool`) while the polyfill loads registers once it is there, in order, and unregistering before then cancels it. The cursor installs first. So the "render nothing until the polyfill has loaded" gate goes away: pages render inside the provider on first paint, Server Components included. A tool registered with no polyfill coming still warns once.
  
  - `@webmcp-agents/core`: the polyfill moves in, as `@webmcp-agents/core/polyfill` (`installWebMCPPolyfill`, `PolyfillModelContext`) and the side-effect `@webmcp-agents/core/polyfill/auto`. New `loadWebMCPPolyfill()` (load it only where needed, once per page) and `whenModelContext(listener)` (run once the page has `document.modelContext`), and the `PolyfillOption` type.
  - `@webmcp-agents/react`: `<WebAgentsProvider polyfill>`; `useWebTool`'s `registered` and `supported` turn true once the polyfill is there.
  - `@webmcp-agents/polyfill`: **deprecated**. It re-exports `@webmcp-agents/core/polyfill` and `/polyfill/auto`, so existing imports keep working. To move on, uninstall it and delete the `import("@webmcp-agents/polyfill/auto")` and the "ready" state that waited for it.
  - `@webmcp-agents/devtools` and `@webmcp-agents/chat`: the panel and the chat bind to `document.modelContext` once it exists (`whenModelContext`), so they work when they start before the polyfill.
- Updated dependencies [[`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`d5126c6`](https://github.com/webmcp-agents/webmcp-agents/commit/d5126c67cab8360b488dd5ba71250dab529facf1), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`da60d2d`](https://github.com/webmcp-agents/webmcp-agents/commit/da60d2d7db94abfc7b07773597f9d7f93aeb46fd), [`0a20fa6`](https://github.com/webmcp-agents/webmcp-agents/commit/0a20fa6c9194b3faacafc10a91d5b91c371fdc2a), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb), [`2c38778`](https://github.com/webmcp-agents/webmcp-agents/commit/2c38778dbc9d053ce1f3ec7506246cd70946c7fb), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624)]:
  - @webmcp-agents/core@0.2.0
