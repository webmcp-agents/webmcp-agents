# @webmcp-agents/local-agent

## 0.3.0

### Patch Changes

- [#5](https://github.com/webmcp-agents/webmcp-agents/pull/5) [`ca29ebc`](https://github.com/webmcp-agents/webmcp-agents/commit/ca29ebccc3a29059582a0520f135addf0a9c6f35) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - The chat notices when the person changes pages themself between turns (a new path, query or hash): the next message reaches the model with a one-line note ("went from /shop to /product/… on their own"), so "add that item" means the page they are on, not the last turn's results. Turns where the page didn't move send exactly what they did before. The on-device agent ranks its tools by what the person wrote, never by that note.
- Updated dependencies [[`428f45e`](https://github.com/webmcp-agents/webmcp-agents/commit/428f45e5b44d7a278bf8f951d6e27d3451ae4777), [`2d7f81d`](https://github.com/webmcp-agents/webmcp-agents/commit/2d7f81d846f4b11cd802734fafa4f47ec2605434), [`b14a728`](https://github.com/webmcp-agents/webmcp-agents/commit/b14a728a7cb9b9167dafdef105c80cc1ecef9306), [`ca29ebc`](https://github.com/webmcp-agents/webmcp-agents/commit/ca29ebccc3a29059582a0520f135addf0a9c6f35), [`868c746`](https://github.com/webmcp-agents/webmcp-agents/commit/868c746dbc50cbefe6a19cc11cdcdf88b4a1ca9f), [`2d7f81d`](https://github.com/webmcp-agents/webmcp-agents/commit/2d7f81d846f4b11cd802734fafa4f47ec2605434)]:
  - @webmcp-agents/chat@0.3.0

## 0.2.0

### Minor Changes

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`cd314a7`](https://github.com/webmcp-agents/webmcp-agents/commit/cd314a7c53ea6fe601f609dae0a38ac0b628d841) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - - chat: `defineWebAgent` (new `@webmcp-agents/chat/agent` entry): one agent definition (instructions, a tool subset, sub-agents, a model id, maxSteps) shared by the browser and the server. `<AgentChat agent>` / `useAgentSession(adapter, { agent })` filter the page's tools through it and run sub-agents as nested `delegate_to_<id>` runs on the same adapter. `createChatHandler({ agents })` looks agents up by id (the page never sends instructions) and runs each request with an AI SDK `ToolLoopAgent` (`toToolLoopAgent`); `prepareAgent` tunes it.
  - chat: any frontier model from one string: `model: "<provider>/<model>"` resolved by `resolveModel` with the provider's optional `@ai-sdk/*` package (anthropic, openai, google, deepseek, xai, mistral), `@openrouter/ai-sdk-provider` (`openrouter/<vendor>/<model>`), or the AI Gateway; provider-neutral `reasoning` (the Anthropic `effort` option is deprecated); GET reports `provider` and `agents`; 503s name the env var to set; tool-call provider metadata round-trips. The cloud adapter labels itself after the endpoint's model and takes an `id`. `webAgentsChatDev` forwards every `*_API_KEY`, `AI_GATEWAY_*` and `WEB_AGENTS_*` variable and takes `agents`.
  - local-agent: the page's agent (`req.agent`) wins over `createLocalAdapter({ instructions, maxSteps })`; a delegation note is added when it has sub-agents.

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`0a20fa6`](https://github.com/webmcp-agents/webmcp-agents/commit/0a20fa6c9194b3faacafc10a91d5b91c371fdc2a) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - - core: a string `target` that matches nothing now falls back to the `[toolname]` element, for the cursor and the confirmation click. `target` is documented as rarely needed.
  - chat: `webAgentsChatDev` refuses to start when a `VITE_*` variable is named like a secret (`secretGuard`); `AdapterStatus.loading` carries `progress`; adapters can offer `models()` / `selectModel()` and the widget shows a model picker.
  - local-agent: a model already on the device loads with the status `loading`, never `downloading`; the cache check asks transformers.js (`ModelRegistry.is_pipeline_cached`) instead of a localStorage hint; `createLocalAdapter({ models, dtype })` offers several models to pick from; `MODELS` entries gain `label` and `brief`; `DEFAULT_MODEL` replaces the `DEFAULT_GPU_MODEL` / `DEFAULT_CPU_MODEL` aliases (kept, deprecated).

- [#1](https://github.com/webmcp-agents/webmcp-agents/pull/1) [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - Initial release: the agent cursor and visual layer (core), a document.modelContext polyfill, React bindings,
  devtools, a chat widget with a cloud agent, and an on-device agent.

### Patch Changes

- Updated dependencies [[`cd314a7`](https://github.com/webmcp-agents/webmcp-agents/commit/cd314a7c53ea6fe601f609dae0a38ac0b628d841), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`aa76c04`](https://github.com/webmcp-agents/webmcp-agents/commit/aa76c04583d369fefb757bbb176dd5be0a150cf5), [`0a20fa6`](https://github.com/webmcp-agents/webmcp-agents/commit/0a20fa6c9194b3faacafc10a91d5b91c371fdc2a), [`27088fe`](https://github.com/webmcp-agents/webmcp-agents/commit/27088feef01c455889e391f689c8f2be9eeecbcb), [`e02b657`](https://github.com/webmcp-agents/webmcp-agents/commit/e02b657b080039e109da16431b55374af4952624), [`d42d8a2`](https://github.com/webmcp-agents/webmcp-agents/commit/d42d8a24d62e676a9a7b3384b6a91724f83ad203)]:
  - @webmcp-agents/chat@0.2.0
