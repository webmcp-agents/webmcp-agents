# Roadmap: `@webmcp-agents` — WebMCP helpers, visuals, devtools and agents

Source: `TODO.md` (8 items + 1 issue + 1 priority). This file is the **single source of truth for
shared decisions and public contracts**. Every phase plan (`01-…` → `14-…`) builds against it.
If a phase needs to change a contract here, update this file in the same commit.

---

## Phase map

| # | Plan file | TODO items | Depends on | Complexity |
|---|---|---|---|---|
| 1 | `01-monorepo-core-extraction.md` | #1 monorepo, issue #1 (cursor yields to user), priority (perf/DX foundation) | — | High |
| 2 | `02-react-provider-webtool.md` | #6 context provider + `enableTools`, #7 `WebTool` API aligned with server tools | 1 | High |
| 3 | `03-devtools.md` | #3 devtools (TanStack-devtools-inspired, JSON-schema runner) | 1, 2 | Medium-High |
| 4 | `04-example-apps.md` | #2 ecommerce + flights examples | 1, 2, 3 | High |
| 5 | `05-chat-widget-cloud-agent.md` | #4 chat widget, #5 agents (cloud adapter first) | 1, 2 | High |
| 6 | `06-in-browser-agent.md` | #5 agents (in-browser adapter: transformers.js / Chrome Prompt API) | 5 | High |
| 7 | `07-vercel-deploy-ci.md` | #8 deploy to Vercel (+ CI, publishing) | 4, 5 | Medium |
| 8 | `08-docs-site-blume.md` | docs site (Blume) rendering `docs/` | 1–7 | Medium |
| 9 | `09-scope-rename.md` | npm scope `@web-agents/*` → `@webmcp-agents/*` (2026-11-08) | 8 | Low |
| 10 | `10-fixes-target-secrets-local-model.md` | `target` fallback + docs, `VITE_*` secret guard, on-device loading state + model picker | 9 | Medium |
| 11 | `11-agents-and-providers.md` | `defineWebAgent` (instructions, tool subsets, sub-agents) on the AI SDK `ToolLoopAgent`; any provider (`provider/model` ids, OpenRouter, AI Gateway) | 10 | High |
| 12 | `12-ai-elements-and-nextjs.md` | `useAgentChat` (AI SDK `UIMessage`), the `@webmcp-agents` shadcn registry (AI Elements patterns), Next.js example | 10, 11 | High |
| 13 | `13-docs-media.md` | screenshots + clips captured by Playwright into `docs/media/` | 12 | Medium |
| 14 | `14-imperative-tools.md` | one way to write a tool: `useWebTool({…})` with `execute`, the cursor finds controls by role and name (`target` locators, `fields`, `fill`), plain flags, `match`, `tool.invoke`, `createWebAgents`; then `agent.invoke` / `useWebAgent`, `@webmcp-agents/tools`, apps and docs moved over. Done (2026-11-09): code, apps, e2e and docs | 13 | High |
| 15 | `15-docs-framework-first.md` | docs that start with your framework and stay in it: Get started (Introduction, Installation per framework), a ten-page Build path, Concepts, More, Examples; framework views (`<View>`), compiled examples in `docs/_examples`, one reference template, a docs check. Four steps: A foundation and one slice (2026-11-09), B the Build path, C reference, D concepts, more, examples and links | 14 | Medium |
| 17 | chat restore (full rewind) | Cursor-like conversation restore in `@webmcp-agents/chat`: `session.restore(userMessageId)` truncates the thread, auto-restores field fills from an in-memory journal, and runs optional per-tool `defineWebTool({ revert })` newest-first. Distinct from a field undo toast. Library API + AgentChat/registry Restore control; examples wire `revert` on mutating tools | 5, 14 | Medium |

Phases 3 and 5 are independent of each other and may run in parallel after Phase 2.
Phase 7's static-deploy half can run any time after Phase 4; the `/api/chat` half needs Phase 5.

Execute each phase with: `/prime` → `/execute .agents/plans/0N-….md` → `/code-review` → `/simplify` → `/commit`.

---

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| npm scope | **`@webmcp-agents/*`** (user decision; renamed from `@web-agents/*` on 2026-11-08, API identifiers such as `WebAgentsProvider` and `WEB_AGENTS_*` env vars unchanged) | — |
| Monorepo | pnpm 11 workspaces + **Turborepo 2.11** | user request; pnpm already in use (`pnpm-lock.yaml`, `pnpm-workspace.yaml` exist) |
| Package split | scoped multi-package (user decision) | isolation; heavy deps (AI SDK, transformers.js) never leak into core |
| Library build | **tsdown 0.23** (Rolldown) | tsup is unmaintained ("consider tsdown instead"); with `"type": "module"` it emits `dist/*.js` + `*.d.ts` |
| Dev resolution | custom export condition **`"@webmcp-agents/source"`** → `src/*.ts` | apps & typecheck hit source (no `^build` in dev), published package stays compiled |
| Runtime | React **19.3** + Vite **8** + `@vitejs/plugin-react` 6 in apps; packages peer `react >=18` | upgrade while restructuring; Vite 8 = Rolldown, ESM-only |
| TypeScript | **~6.0.3** (NOT 7) | TS 7 has no stable programmatic API until 7.1; breaks tooling |
| Lint/format | **Biome 2.6** at the root | one fast tool; no ESLint needed now |
| Tests | **Vitest 5** — `node` env for pure logic, **browser mode (`@vitest/browser-playwright`, chromium)** for DOM/layout/animation; **Playwright 1.65** e2e per app (Phase 4+) | jsdom has no layout, fake rAF, partial `SubmitEvent.submitter` |
| Schemas | **Standard Schema** (`@standard-schema/spec` 1.1) + Standard JSON Schema; zod 4 in examples | same contract Mastra `createTool` uses → library-agnostic |
| Agent runtime | pluggable `AgentAdapter`; the server runs an **AI SDK v7 `ToolLoopAgent`** built per request from a `defineWebAgent` definition (instructions, tool subset, sub-agents as `delegate_to_<id>` client-executed tools, model); any provider SDK (`@ai-sdk/*`, `@openrouter/ai-sdk-provider`, optional peers) or the AI Gateway; browser executes tools | user decision (2026-11-08: build on the ecosystem, not hand-rolled); key stays server-side |
| Default model | `anthropic/claude-opus-5-5` (`WEB_AGENTS_MODEL` overrides with any `<provider>/<model>` id: `openai/…`, `deepseek/…`, `openrouter/<vendor>/<model>`, …; `anthropic/claude-sonnet-5-5` for public demos) | current recommended default; one string + one env var for any model |
| In-browser agent | **transformers.js v4** (WebGPU or WASM, Qwen3 0.6B ONNX by default; 1.7B opt-in) in a Worker; Chrome Prompt API provider when available | WebLLM tool calling still "WIP" |
| Devtools host | standalone panel **and** optional TanStack Devtools plugin (`@tanstack/devtools` 0.16, still 0.x) | don't force TanStack on users |
| Schema form | hand-rolled ~200-line JSON-schema renderer | WebMCP schemas are shallow; RJSF ≥100 KB with ajv |
| Router (examples) | React Router 7 (data mode, `createBrowserRouter`), pinned `^7.18.5` | small; provider is router-agnostic via `pathname` (apps pass `useLocation().pathname`). 8.x exists (8.5 on 2026-11-06); not adopted in Phase 4 |
| Designs | hand-built, mirroring demo.yournextstore.com and react-flights-ui.vercel.app (no opendesign MCP connected) | user decision |
| Deploy | one Vercel project per app, Root Directory `apps/<name>`, `api/chat.ts` web-standard function | Vercel Turborepo docs |

Always confirm versions with `npm view <pkg> version` before pinning; numbers above were current on 2026-11-06.

| Package | Version |
|---|---|
| turbo / turbo-ignore | 2.11.10 |
| tsdown | 0.23.7 |
| typescript | ~6.0.3 |
| vite / @vitejs/plugin-react | 8.3.6 / 6.2.1 |
| react, react-dom / @types/react | 19.3.1 / 19.3.0 |
| vitest, @vitest/browser, @vitest/browser-playwright | 5.1.0 |
| @playwright/test | 1.65.0 |
| @biomejs/biome | 2.6.6 |
| use-webmcp-tool | 0.3.0 (repo has 0.2.0; check its changelog before bumping) |
| zod / @standard-schema/spec | 4.6.7 / 1.1.0 |
| ai / @ai-sdk/react / @ai-sdk/anthropic | 7.0.163 / 4.0.167 / 4.0.97 |
| @tanstack/devtools / @tanstack/react-devtools / @tanstack/devtools-event-client | 0.16.0 / 0.10.14 / 0.5.1 |
| @huggingface/transformers | 4.3.2 |
| hono (optional) | 4.13.16 |
| react-router | 7.x latest |

---

## Target repository layout (end state)

```
.
├── apps/
│   ├── playground/        ← today's demo (Phase 1), minimal store, every tool kind
│   ├── ecommerce/         ← YNS-style store (Phase 4)
│   └── flights/           ← react-flights-style booking (Phase 4)
├── packages/
│   ├── core/              @webmcp-agents/core      visuals (cursor, motion, spotlight), events, WebTool, registry, the polyfill (/polyfill)
│   ├── polyfill/          @webmcp-agents/polyfill  deprecated (2026-11-10): re-exports @webmcp-agents/core/polyfill
│   ├── react/             @webmcp-agents/react     <WebAgentsProvider> (+ the devtools in dev), useWebTool, useEnableTools, <EnableTools>, JSX attr types
│   ├── devtools/          @webmcp-agents/devtools  panel + TanStack plugin + schema runner
│   ├── chat/              @webmcp-agents/chat      <AgentChat>, AgentAdapter, cloud adapter, /server handler, /vite dev plugin
│   ├── local-agent/       @webmcp-agents/local-agent  in-browser adapter (Worker + transformers.js / Prompt API)
│   ├── tools/             @webmcp-agents/tools     common tools: get_time, get_location, get_page, go_to, go_back, scroll_to, set_theme
│   └── vercel-api/        @webmcp-agents/vercel-api (private) shared /api/chat for the apps: guard, rate limit (Phase 7)
├── .agents/plans/
├── biome.json  turbo.json  pnpm-workspace.yaml  tsconfig.base.json  vitest.config.ts  package.json
└── CLAUDE.md              ← generated with /create-rules at the end of Phase 1
```

Dependency direction (no cycles, enforced by review): `core` → none (types only from `@standard-schema/spec`; the
polyfill is core's own `src/polyfill`, reached by dynamic import); `polyfill` (deprecated) → core; `react` → core, devtools (2026-11-10: the provider loads the devtools in development); `devtools` → core (never react:
its React entry finds the cursor with core's `currentAgentVisuals()`); `chat` → core, react;
`local-agent` → chat (types only); `tools` → core. Apps → anything.

---

## Public contracts (all phases must match these names)

### `@webmcp-agents/core` (Phase 1 creates, Phase 2 extends)

```ts
// visuals — Phase 1
export function installAgentVisuals(options?: AgentVisualsOptions): AgentVisuals;
export interface AgentVisualsOptions {
  log?: (entry: AgentEvent) => void;        // kept for back-compat; same payloads as onAgentEvent
  linger?: number;                          // default 1200
  name?: string;                            // default ""
  sync?: boolean;                           // default true
  spotlight?: boolean | SpotlightOptions;   // default false
  yieldToUser?: boolean | YieldOptions;     // default true  (issue #1)
}
export interface YieldOptions {
  moveThreshold?: number;  // px, default 6
  resumeAfter?: number;    // ms, default 800
  ignore?: string;         // CSS selector; input inside it never yields. Default `[${UI_HOST_ATTR}]`
}
export const UI_HOST_ATTR = "data-web-agents-ui";

// tool calls from library UIs — Phase 3 creates (devtools is the first consumer), Phase 5 reuses
export interface ExecuteToolOptions { signal?: AbortSignal }
export function executeTool(name: string, args: Record<string, unknown>, opts?: ExecuteToolOptions):
  Promise<ModelContextToolResult | null>;   // getTools() lookup, Chrome 150/156 args-shape fallback, null on navigation,
                                            // abort → cancelTool?.(name) + AbortError. Done in Phase 3 (core/src/execute.ts).
export function normalizeToolResult(res: ModelContextToolResult | string): ModelContextToolResult;
export interface AgentVisuals {
  setSpotlight(spotlight: boolean | SpotlightOptions): void;
  setYieldToUser(value: boolean | YieldOptions): void;
  destroy(): void;                          // ref-counted: last destroy tears everything down
}

// events — Phase 1
export type AgentEvent =
  | { type: "start"; tool: string; at: number; args?: unknown }   // args: imperative tools only (Phase 3)
  | { type: "fill"; tool: string; field: string; value: string | boolean }
  | { type: "park"; tool: string; prompt: string }
  | { type: "result"; tool: string; result: unknown; ms: number }
  | { type: "error"; tool: string; error: string; ms: number }
  | { type: "cancel"; tool: string }
  | { type: "yield"; reason: "pointer" | "keyboard" | "wheel" | "touch" }
  | { type: "resume" };
export function onAgentEvent(listener: (e: AgentEvent) => void): () => void;
// Since Phase 3: an imperative tool with no element on screen still emits start + result/error (no animation),
// so every call through the registerTool wrapper is observable. A call that rejects with an AbortError emits `cancel`,
// never `error` (toolcancel may emit a second `cancel` for the same call; consumers ignore one with no open call).
// Events still carry no call id: consumers correlate by tool name ("newest unfinished call"). If Phase 5 needs exact
// correlation, add an optional `callId` to AgentEvent here first.

// WebTool — Phase 2  (shape is a structural superset of Mastra's createTool config)
export interface WebToolConfig<I = unknown, O = unknown> {
  id: string;                               // == WebMCP tool name, /^[a-zA-Z0-9_.-]{1,128}$/
  title?: string;
  description: string;
  inputSchema?: StandardSchemaV1<unknown, I> | JSONSchema;   // Standard Schema (zod/valibot/arktype) or plain JSON Schema
  outputSchema?: StandardSchemaV1<unknown, O>;
  annotations?: WebToolAnnotations;         // readOnlyHint, destructiveHint, idempotentHint, openWorldHint, untrustedContentHint, …
  // Phase 14: flags in plain words, becoming the annotation at registration (a flag wins over the same hint in `annotations`)
  readOnly?: boolean;                       // → readOnlyHint
  destructive?: boolean;                    // → destructiveHint
  repeatable?: boolean;                     // → idempotentHint
  external?: boolean;                       // → openWorldHint
  safeResponse?: boolean;                   // → untrustedContentHint, inverted (false: the answer holds text the site did not write)
  requireConfirmation?: boolean;            // park the cursor and wait for a trusted user click on the tool's control; validates first;
                                            // fails closed (ConfirmationUnavailableError) with no control, or several found by name
  target?: ToolTarget | TargetFn<I>;        // where the cursor goes and whose click confirms. Default: the button, link, tab, menu item
                                            // or switch named like `title` (or the id read as words). ToolTarget = a CSS selector or a
                                            // ToolLocator; a function gets the call's input and returns either or an Element. Order:
                                            // explicit `target` → a `[toolname="<id>"]` marker → the inferred name. A tool with no
                                            // control runs unseen (bivariant method type: WebTool<I> fits WebTool)
  fields?: { [param in keyof I]?: FieldTarget };  // where a parameter is typed: a ToolLocator, a label string, or false (never).
                                            // Default: the control with that `name`, else labelled like the parameter, nearest the target
  fill?(values: I): unknown;                // put the call's values on screen for what cannot be typed (a custom Select); runs after
                                            // the typing, before the click/park; a returned promise is awaited
  match?: string | readonly string[] | RegExp;  // where a catalog tool is on (path patterns as matchPath, or a RegExp); default everywhere
  execute(input: I, ctx: WebToolContext): O | Promise<O>;
}
export interface WebToolContext {
  signal: AbortSignal;
  source: "webmcp" | "chat" | "devtools" | "test";
  toolCallId?: string;
  context?: RegisteredContext;              // legacy (Phase 14: tools close over their own state / read a module store): the provider's `context` prop / registry option
}
export interface Register {}                // augment: declare module "@webmcp-agents/core" { interface Register { context: CartApi } }
type RegisteredContext = Register extends { context: infer C } ? C : unknown;
export interface WebTool<I = unknown, O = unknown> extends Readonly<Omit<WebToolConfig<I, O>, "execute">> {
  readonly kind: "web-tool";
  readonly jsonSchema: JSONSchema;          // input schema as JSON Schema draft-07, `$schema` stripped; lazy, memoised
  execute(input: I, ctx: WebToolContext): Promise<O>;     // always async (Mastra's execute returns a Promise)
  parse(input: unknown): Promise<I>;                      // ~standard.validate (throws WebToolInputError); JSON Schema input passes through
  run(input: unknown, ctx: WebToolContext): Promise<O>;   // parse, then execute (no page, no cursor: for unit tests)
  invoke(input?: I, options?: ExecuteToolOptions): Promise<O>;  // Phase 14: call it the way an agent would (cursor, typing, confirmation);
                                                          // resolves to what execute returned; rejects with WebToolError / AbortError
}
// With a Standard Schema input the result also has `inputSchema: StandardSchemaV1<unknown, I>` (assignable to Mastra's config).
export function defineWebTool<I, O>(config: WebToolConfig<I, O>): WebTool<I, O>;
export class WebToolInputError extends Error { toolId: string; issues: StandardSchemaV1.Issue[] }
export function isWebMCPAvailable(): boolean;            // feature detection for packages that may not touch document.modelContext
export function webToolSignature(tool: WebTool): string;  // what WebMCP sees; re-register iff it changes
export interface ToModelContextToolOptions {
  context?: () => unknown;                  // read per call → ctx.context
  calls?: CallTracker;                      // counts calls (confirmation wait included) so release can wait
}
export function toModelContextTool(tool: WebTool, opts?: ToModelContextToolOptions): ModelContextTool;  // errors → isError results; AbortError rethrown
export function registerWebTool(source: WebTool | (() => WebTool), opts?: ToModelContextToolOptions & { signal?: AbortSignal }): () => void;
  // a function source: execute/target/fields/fill are read from it on every call (what useWebTool passes);
  // no document.modelContext → warns once, returns a no-op; re-registering an id replaces the old registration,
  // whose unregister then becomes a no-op (a stale deferred release can't remove the newer tool)

// deferred release — Phase 2 (shared by the registry and @webmcp-agents/react)
export const RESPONSE_GRACE_MS = 500;
export function deferRelease(release: () => void, opts?: { isBusy?: () => boolean; graceMs?: number }): { cancel(): void };
export interface CallTracker { track<T>(call: () => T | Promise<T>): Promise<T>; busy(): boolean }  // busy: running or < grace since settle
export function createCallTracker(): CallTracker;
export function matchPath(pattern: string, pathname: string): boolean;   // literal, :param, trailing *, "*"
export function toToolResult(value: unknown): ModelContextToolResult;    // same rules as the polyfill
export function errorResult(err: unknown): ModelContextToolResult;
export function errorText(err: unknown): string;          // err.message or String(err) (Phase 3)
export function isAbortError(err: unknown): boolean;      // cancellation, not failure (Phase 3)

// registry — Phase 2 (framework-agnostic, ref-counted)
export function createToolRegistry(
  catalog: readonly WebTool[],
  options?: { beforeRegister?: () => void; context?: () => unknown },
): ToolRegistry;
export interface ToolRegistry {
  enable(names: readonly string[]): () => void;   // ref-counted; disposer defers unregister until in-flight calls settle + 500 ms
  update(catalog: readonly WebTool[]): void;      // re-registers only tools whose signature changed
  enabled(): readonly string[];                   // sorted, stable identity until it changes (useSyncExternalStore)
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

// locator — Phase 14: a control the way a person finds it, by role and accessible name
export interface ToolLocator { role?: string; name?: string | RegExp; within?: string | Element }  // exact name beats "starts with"; only visible, enabled controls
export type FieldTarget = ToolLocator | string | false;   // string = the field's label
export function locate(locator: ToolLocator): Element | null;

// createWebAgents — Phase 14: the framework-free entry (<WebAgentsProvider> is a thin wrapper over it)
export type WebToolCatalog = Readonly<Record<string, WebTool>> | readonly WebTool[];   // an object: a tool cannot be listed twice
export type AvailableTools = readonly (WebTool | string)[];                             // by reference, by catalog key, or by id
export interface WebAgentsOptions {
  tools: WebToolCatalog;                    // two tools with one id throw, naming both keys
  availableTools?: AvailableTools;          // what an agent may use right now; default all
  visuals?: AgentVisualsOptions | false;    // default {}; false: tools register without animation
  context?: () => unknown;                  // legacy: ctx.context
  polyfill?: PolyfillOption;                // "auto" (default): no document.modelContext → load the polyfill (own chunk), cursor + tools wait; false: never
  start?: boolean;                          // false: inert until start() (a framework binding creating it during a render)
}
export interface WebAgents {
  setAvailableTools(tools: AvailableTools | undefined): void;
  setTools(catalog: WebToolCatalog): void;  // only changed definitions re-register
  destroy(): void;                          // graceful: tools released after their call in flight; start() revives it
  start(): void;
  setPathname(pathname: string | undefined): void;   // legacy: match against a router's path instead of the URL
  readonly registry: ToolRegistry;
  readonly visuals: Pick<AgentVisuals, "setSpotlight" | "setYieldToUser">;
}
export function createWebAgents(options: WebAgentsOptions): WebAgents;   // a tool is registered when available AND (no `match` OR it fits the path); no-op on the server

// the polyfill, loaded by the provider (2026-11-10): no app imports it, no "ready" gate
export type PolyfillOption = "auto" | false;
export function loadWebMCPPolyfill(): Promise<ModelContext | undefined>;  // native → resolves at once; else import("./polyfill") once, install, flush the queue; rejects if the chunk fails (retry next call)
export function whenModelContext(listener: (mc: ModelContext) => void): () => void;  // now if present, else once the polyfill installs; never starts a load (devtools, chat)
// registerWebTool while the polyfill loads: queued, registered in order once it is there; its unregister cancels the queued one
export function watchPathname(listener: () => void): () => void;        // URL changes without a page load: the Navigation API, else patched history.pushState/replaceState, plus popstate and hashchange
                                                                         // (`#/orders` counts as `/orders`); notified just after the navigation call returns (a microtask)

// inspection — Phase 14 (for the devtools; the cursor's own resolver, no second implementation)
export function inspectTools(): ToolInspection[];  // registered WebTools + every started createWebAgents catalog (on or off here)
export function currentAgentVisuals(): WebAgents["visuals"] | null;  // 2026-11-10: the latest started createWebAgents' cursor controls (visuals: false skipped); devtools' default `visuals`
export interface ToolInspection extends ToolControls { tool: WebTool; fits: boolean }  // fits: `match` fits the current path
export interface ToolControls {
  by: "target" | "marker" | "name" | "call";      // "call": a function target, resolved per call only
  controls: Element[];                            // what a call with no particular input acts on
  fields: { name: string; field: Element | null }[];  // each schema parameter and the field it would be typed into
}
```

### `@webmcp-agents/core/polyfill` (Phase 1; moved into core 2026-11-10)

```ts
// @webmcp-agents/core/polyfill (src/polyfill/index.ts; createWebAgents reaches it by dynamic import)
export function installWebMCPPolyfill(): ModelContext | undefined;   // no-op returning the native one if present; undefined on the server
export class PolyfillModelContext extends EventTarget implements ModelContext { cancelTool(name: string): boolean; … }
// side-effect entry: import "@webmcp-agents/core/polyfill/auto";
// @webmcp-agents/polyfill (+ /auto): deprecated, re-exports the two entries above so published imports keep working
```

### `@webmcp-agents/react` (Phase 2)

```tsx
// Phase 14: the same line in Vite, TanStack Start, Next.js and Astro; no router wiring (core follows the URL)
<WebAgentsProvider
  tools={tools}                           // WebToolCatalog: an object { getCart, listOrders } (all on, each where its `match` fits); define at module level
  availableTools={[tools.getCart]}        // optional: what an agent may use right now (tools by reference or key); default all
  visuals={{ spotlight: true }}           // AgentVisualsOptions | false
  polyfill={false}                        // optional: "auto" (default) loads the polyfill where WebMCP is missing; children render meanwhile
  devtools={false}                        // 2026-11-10, optional: boolean | ProviderDevtoolsOptions (DevtoolsOptions minus visuals); default true =
                                          //   installWebAgentsDevtools({ visuals: its cursor }) when process.env.NODE_ENV === "development" only
                                          //   (literal check around the import(): no devtools chunk in production; none under "test")
>
// Earlier form, still working: an ARRAY `tools` is opt-in (off until named), plus
//   global={["search_products"]}  routes={{ "/checkout": ["place_order"] }}  (matchPath patterns)
//   pathname={…}  (overrides the built-in tracking, for routes and `match`)  context={cart}  (reaches execute as ctx.context, typed via Register)
useEnableTools(["apply_promo"]);           // enable while mounted (ref-counted)
<EnableTools names={["apply_promo"]} />    // component form
useWebTool(definition | tool, { enabled?: boolean });  // Phase 14: the definition itself (as defineWebTool), registered while mounted
                                           //   → { invoke, registered, supported }; calls read the latest render's execute/target/fields/fill; works without a provider
useEnabledTools();                         // catalog ids registered right now
useWebAgents();                            // { registry, visuals: { setSpotlight, setYieldToUser } | null, pathname, getContext, ensureVisuals }
useOptionalWebAgents();                    // same, or null outside a provider (Phase 3; for library UI that works without one)
usePathname();                             // location.pathname via core's watchPathname (Navigation API, else history, popstate, hash)
useToolAnswer();                           // today's useAnswerGrace, for declarative forms
useAgentEvents(listener);                  // subscribe to core events
// + JSX attribute augmentation (toolname, tooldescription, toolautosubmit, toolparamdescription)
```

### `@webmcp-agents/devtools` (Phase 3)

```ts
export function installWebAgentsDevtools(options?: DevtoolsOptions): () => void;  // vanilla floating panel (idempotent)
export interface DevtoolsOptions {
  visuals?: Pick<AgentVisuals, "setSpotlight" | "setYieldToUser"> | null;  // default: core's currentAgentVisuals() (the started provider's)
  initialOpen?: boolean;                    // default false
  initialSettings?: Partial<DevtoolsSettings>;  // below saved settings; pass `spotlight` matching the installed visuals
  hotkey?: string | false;                  // default "Alt+Shift+A"
  eventClient?: boolean;                    // TanStack event bus bridge (pluginId "web-agents"), default true
}
export function createDevtoolsStore(options?: DevtoolsStoreOptions): DevtoolsStore;  // useSyncExternalStore store, serialisable snapshots
export { SchemaForm, defaultValueFor, parseSchema, toAgentInvokeCode, toExecuteToolCode };  // reusable (Phase 5 tool cards); toAgentRunCode = deprecated alias
// ToolView (Phase 14) adds: registered, control?: { by, count, label: "button · Add to cart" | "none: runs unseen" | "3 matches"
//   | "depends on the call", warn }, fields?: { name, field: "spinbutton · Quantity" | null }[], match?: string, fits, flags: FlagView[]
//   (read-only, destructive, repeatable, external, untrusted answer). Off-here catalog tools are listed with registered: false.
//   Locate goes to what core's resolver finds, else the `toolname` element.
export function installAgentConsole(o?): () => void;   // deprecated alias
// "@webmcp-agents/devtools/react":   <WebAgentsDevtools {...DevtoolsOptions} />, useDevtoolsStore(options),
//                                 webAgentsDevtoolsPlugin(options) → { id: "web-agents", name: "Web Agents", render }
// peers: react, react-dom (required); @tanstack/react-devtools (optional; /react entry). No @webmcp-agents/react (it depends on this).
// <WebAgentsProvider> installs the floating panel in development; these are for pages without it, or placing it by hand (devtools={false})
// window.agent = { invoke(name, args), run (= invoke, back-compat), list() } (set by the store, restored on destroy).
```

### `@webmcp-agents/chat` (Phase 5) / `@webmcp-agents/local-agent` (Phase 6)

```ts
export interface AgentAdapter {
  readonly id: string;
  readonly label: string;
  status?(): AdapterStatus;                               // e.g. { state: "downloading", progress: 0.42 }; may return a new object per call
  subscribe?(listener: () => void): () => void;           // status changes
  prepare?(signal?: AbortSignal): Promise<void>;          // opt-in heavy setup (model download), started by a click; abort cancels
  run(req: AgentRunRequest): AsyncIterable<AgentStreamPart>;
}
export interface AgentRunRequest {
  messages: AgentMessage[];
  readonly tools: ToolDescriptor[];                       // a getter: read it fresh before every model call (tools change with the page)
  signal: AbortSignal;
  callTool(call: { id: string; name: string; input: unknown }): Promise<ToolOutput>;  // never rejects; failures are isError results
}
// AgentPart = text | reasoning (signed thinking, sent back to the model, not rendered) | tool { id, name, input, state, output?, error?, prompt? }
// AgentStreamPart = message-start | text-delta | reasoning | tool-call | tool-result | tool-error | step-finish
//                 | finish { reason: "stop" | "max-steps" | "aborted" } | error { code?: chat_disabled | rate_limited | bad_request | network }
// <AgentChat adapter={…} /> or <AgentChat adapters={[cloud, local]} /> (switcher); title, defaultOpen, position, suggestions, storageKey, layout ("docked" default, resizable | "floating")
// createCloudAdapter({ api: "/api/chat", maxSteps: 8, headers, fetch }); useAgentSession(adapter); listToolDescriptors(); callModelContextTool()
// "@webmcp-agents/chat/agent" (Phase 11): defineWebAgent({ id, description?, instructions, tools?: string[] | (tools) => tools, agents?, model?, maxSteps? })
//    → WebAgent (frozen data, shared by browser and server); selectTools(agent, tools) adds one `delegate_to_<id>` tool per sub-agent;
//    <AgentChat agent>, useAgentSession(adapter, { agent }); AgentRunRequest.agent; a delegate call runs the sub-agent's loop on the
//    same adapter, nested under the call (AgentPart.tool.agent, SessionAction part.within). The cloud adapter sends only `agent: id`.
//    Phase 14: `tools` also takes tool objects (`[tools.getCart, "list_orders"]`, stored as ids); every agent has
//    `agent.invoke(text, { adapter?, signal?, onStep? }) → Promise<{ text, steps: WebAgentStep[], messages }>` (browser only: loads
//    session/run-agent with a dynamic import(); rejects on the server, on failure (message + code) and with an AbortError).
//    useWebAgent(agent, { adapter? }) → { invoke(text) → Promise<WebAgentResult | undefined> (never rejects), stop(), status:
//    "idle" | "running" | "waiting" | "error", steps, text, error? }. One loop for all: session/run-agent.ts (runAgent, not exported).
//    The adapter defaults to one shared createCloudAdapter() for agent.invoke, useWebAgent, useAgentChat and <AgentChat>.
// useAgentChat({ adapter | adapters, agent?, storageKey? }) (Phase 12): useChat-shaped { messages: UIMessage[], status: ChatStatus, sendMessage, stop,
//    regenerate, clear, tools, suggestions, adapters/adapter/selectAdapter/adapterStatus, models/selectModel/prepare, toolPhase(part) → { phase:
//    running|parked|done|error|cancelled, prompt?, agent?: { id, messages: UIMessage[] } }, session }. <AgentChat> is built on it. The
//    `@webmcp-agents` shadcn registry (registry/ → apps/docs/public/r via `pnpm registry:build`) ships agent-chat, agent-tool,
//    agent-subagent, agent-reasoning, agent-model-selector as copied source (shadcn/ui AI patterns); apps/nextjs installs them.
// "@webmcp-agents/chat/server": createChatHandler({ model: LanguageModel | "<provider>/<model>", agents?, system?, reasoning?: "off"|"low"|"medium"|"high",
//    maxOutputTokens?, maxSteps?, guard?, beforeModel?, prepareAgent?, env? }): (req: Request) => Promise<Response>; per POST an AI SDK
//    ToolLoopAgent via toToolLoopAgentSettings(agent, …) + createAgentUIStreamResponse; resolveModel / modelAvailability / providerOptionsFor
//    (PROVIDERS: anthropic, openai, google, deepseek, xai, mistral, openrouter; gateway fallback for slash ids); GET → { enabled, model, provider, agents }
//    GET → { enabled, model }; POST → one model step as an AI SDK UI message stream; 503 chat_disabled without a key;
//    guard(req) may return a Response (e.g. 429) to short-circuit; cross-site browser requests are refused (403), POST must be
//    application/json. Defaults: claude-opus-5-5, effort "low", 8192 output tokens (thinking counts), fallbacks: "default".
//    Caps in LIMITS (1 MB body, 160 messages, 48 tools, 8 KB schemas). maxSteps tool steps, then one tool-less request.
//    Only the page's same-origin path reaches the system prompt. NOT abuse protection: public deploys need a rate-limiting guard (Phase 7).
// "@webmcp-agents/chat/vite":   webAgentsChatDev({ path?, handler? }) — mounts /api/chat in `vite dev`, key from .env files
// "@webmcp-agents/chat/chat.css": the widget's styles (unlayered, every rule scoped by a .wa-chat* class)
// "@webmcp-agents/local-agent" (Phase 6): createLocalAdapter({ providers?, model?, worker?: Worker | (() => Worker), maxSteps = 4,
//    stepTimeoutMs = 60_000, label = "On-device" }) → AgentAdapter with status/subscribe/prepare(signal). Providers, first
//    available wins: createPromptApiProvider() (Chrome LanguageModel, JSON-constrained tool calls), then
//    createTransformersProvider({ model?, dtype?, worker? }) (Qwen3 0.6B: q4f16 on WebGPU ~585 MB, q4 on WASM ~934 MB;
//    1.7B is opt-in — its 1.4 GB session ran out of WASM memory in testing).
//    LocalProvider { id, label, toolsInline?, availability(), prepare(onProgress, signal?), generate({ system, messages,
//    tools, signal, onToken }), dispose?() }. detectLocalProviders(). Apps: optimizeDeps.exclude + worker.format "es".
// AdapterStatus "needs-download" carries an optional `note` (shown in the download card); <AgentChat adapters> shows a
// radio-group switcher (choice in localStorage "web-agents:chat:adapter") and a consent-first download card.
```

### `@webmcp-agents/tools` (Phase 14)

```ts
// One factory per tool, each returning a defineWebTool tool; every factory takes { id?, description? }.
export function getTime(o?: { locale? }): WebTool;                       // get_time, readOnly: date, time, time zone, locale, relative dates
export function getLocation(o?: { lookup?(pos, signal), prompt?, timeoutMs? }): WebTool;  // get_location, readOnly (+ external with lookup)
export function getPage(o?: { maxHeadings? }): WebTool;                  // get_page, readOnly: title, path, query, hash, language, selection, headings
export function goTo(o: { pages: Record<string, string> }): WebTool<{ page }>;  // go_to: clicks the page's own link, else location.assign
export function goBack(o?): WebTool;                                     // go_back: history.back()
export function scrollTo(o?: { highlightMs? }): WebTool<{ text }>;       // scroll_to: heading or text, highlighted, section quoted
export function setTheme(o?: { get?, set?, control?: ToolLocator | false }): WebTool<{ theme? }>;  // set_theme: the site's switch, else `set`
export { calendarAt, weekOf, DEFAULT_WEEK };                              // the pure calendar get_time uses
// No router, no ctx.context, no DOM at import (SSR-safe); sideEffects: false.
```

---

### Shared UI convention (Phases 1, 3, 5)

Every UI the libraries inject (devtools panel, chat widget) has a host element with the `data-web-agents-ui`
attribute. `user-yield.ts` ignores input whose `composedPath()` contains such a host. Otherwise clicking *Run* in
devtools or typing in the chat would hide the agent cursor the user just asked for.
Floating UIs render in a shadow root at `z-index: calc(var(--agent-z) + 100)`, above the spotlight. In-place UIs
(a host with a size, e.g. the devtools tab inside TanStack Devtools) are cut out of the spotlight by the cursor (Phase 3).
Library UIs call tools through core's `executeTool()`, never `document.modelContext.executeTool` directly.

## Quality bar (TODO "priorities": performance, animation, UI/UX, DX) — applies to every phase

- **Performance budgets** (`pnpm --filter @webmcp-agents/core size`, part of `pnpm check`; Vite/Rolldown minify + gzip -9,
  measured through a re-export so tree-shaking applies): **visuals-only import (`installAgentVisuals`, `onAgentEvent`)
  ≤ 9.25 KB min+gz** (8.96 KB after Phase 3; raised from 9 KB in Phase 10 for the `target` fallback, 9.01 KB; 9.21 KB after
  Phase 14's field step for tools, no raise needed) and **whole package ≤ 16.5 KB** (16.29 KB measured). History of the whole
  package: 12.93 KB after Phase 10, 13.01 KB before Phase 14, 15.76 KB after Phase 14's locator (`locate.ts`), `createWebAgents` and
  URL tracking (`web-agents.ts`), flags, `fields` / `fill` and `invoke`, then 15.99 KB with `inspectTools` for the devtools and 16.02 KB
  with URL notices deferred out of React insertion effects (a Next.js fix). Raised from 13 KB on 2026-11-09 (16 KB, then 16.25 KB): the
  plan estimated +1 KB and a 14.25 KB ceiling, the measured cost was about +3 KB, and the user accepted a raise rather than cut
  `createWebAgents` or split the package. Raised to 16.5 KB on 2026-11-10 for the provider loading the polyfill itself
  (`loadWebMCPPolyfill`, `whenModelContext`, the registration queue, the `polyfill` option: +279 B, 16.29 KB). The polyfill
  is a chunk reached only by dynamic import (2.45 KB): the size script reports it apart and does not count it.
  Raised again on 2026-11-10, to **10 KB** (visuals, 9.96 KB measured) and **17.5 KB** (whole package, 17.41 KB; 17.25 KB
  before the confirm gate's 10 s limit and the person's own call cancelling a waiting confirmation), for the
  cursor's reliability pass: a press waits for its control to scroll into view, pinned controls don't scroll the page, the
  cursor leaves a control that is no longer under it, a parked confirmation follows its control and fails when CSS hides
  it, and calls never wait on frames that are not drawn (a background tab, a hidden pane).
  Decision (Phase 3): no `@webmcp-agents/core/tools` split. Consumers bundle with tree-shaking, so a subpath would not
  shrink what a visuals-only page pays, and it would churn every import for no gain. The per-import budget keeps the
  cursor lean; the whole-package budget caps WebTool/registry/executeTool growth. Revisit if a non-bundled (CDN) build ships;
  no work when idle (rAF loop stops, no polling while the tab is hidden); per-frame DOM reads happen before writes;
  INP unaffected (all listeners `passive`, capture-phase work O(1)).
- **Animation**: transforms/opacity only; spring/minimum-jerk motion stays in `motion.ts`; every new animation has a
  `prefers-reduced-motion` branch. Load the `motion` and `interaction` skills before touching visuals.
- **UI/UX**: every screen covers loading/empty/error/streaming states (`states` skill); `a11y` skill pass on every
  widget (keyboard, focus, live regions); `ux-copy` for all interface text; `polish` before a phase is closed.
- **DX**: one-line install per package, typed options with TSDoc, zero-config defaults, `pnpm dev` starts everything,
  errors name the fix ("call installAgentVisuals() before your app renders").

## Skills & commands per phase

| Phase | Before | During | After |
|---|---|---|---|
| all | `/prime` | `/execute <plan>` | `/code-review`, `/simplify`, `/commit` |
| 1 | — | `motion`, `interaction` (yield-to-user) | `/create-rules` (writes CLAUDE.md), `agent-browser` smoke test |
| 2 | — | `components` (provider/hook API) | `react-doctor` |
| 3 | `stealth` | `components`, `interaction`, `a11y`, `type`, `space`, `dataviz` (timeline) | `react-doctor`, `agent-browser` |
| 4 | `stealth` | `type`, `surface`, `space`, `states`, `mobile-feel`, `ux-copy` | `e2e-test`, `polish` |
| 5 | `claude-api` | `components`, `states`, `a11y`, `ux-copy`, `motion` | `security-review`, `e2e-test` |
| 6 | — | `states` (download progress) | `e2e-test` |
| 7 | — | (Vercel docs) | `security-review`, `agent-browser` against the preview URLs |

## Risks

- WebMCP is an origin-trial API: event targets, `executeTool` arg shapes and `getTools()` fields keep moving. The
  polyfill and the feature detection in `core` absorb it; never call `document.modelContext` outside core (which holds the
  polyfill), devtools and chat.
- tsdown CSS handling is experimental → core ships `cursor.css` as a copied asset, not a bundled import.
- TanStack Devtools is 0.x → plugin lives in a separate entry; the standalone panel is the primary surface.
- A public demo with an Anthropic key needs rate limiting, token caps and an origin check. Done in Phase 7:
  `@webmcp-agents/vercel-api` (private) — `createVercelChatRoute({ app, env?, model? })` → `{ GET, POST, OPTIONS }`;
  `guard`: `originGuard()` (POST needs the request's own Origin) + `rateLimitGuard` (per IP, 30/min + 300/day, 429 with
  retry-after); `beforeModel`: `budgetGuard` (3000 model calls/day → 503 `{error:"unavailable",reason:"daily_budget"}`,
  storage down → `reason:"busy"`). Upstash Redis when `KV_REST_API_*` / `UPSTASH_REDIS_REST_*` exist (errors and
  timeouts: per-IP fails open, budget fails closed), else in-memory. Public demos: claude-sonnet-5-5, 4096 output tokens,
  6 steps. Chat contract additions: `ChatHandlerOptions.beforeModel` (after validation, before the model); the cloud
  adapter only disables itself on `chat_disabled`, other 503s/429s are passing errors. Deploy steps and env table: docs/deploy.md. CI: .github/workflows/ci.yml; releases:
  Changesets (seven public packages `fixed`, `@webmcp-agents/tools` included) + release.yml (npm provenance). Not done without the maintainer: Vercel
  link/deploy/env, Upstash, NPM_TOKEN / npm scope, pushing.
- Top layer: elements opened with `showModal()` / popover render above any z-index, so the cursor overlay
  (`--agent-z` on `body`) would disappear under a modal drawer, and the devtools panel would be inert behind it.
  Decision (Phase 4): the example apps use non-modal panels (`role="dialog"` + `aria-modal`, the page behind
  made `inert`, Escape and focus return handled in the app); core is unchanged (the cursor budget has ~0.04 KB left).
  Revisit in core (`popover="manual"` overlay re-shown after a dialog opens) if a real app needs `showModal()`.
- Per-row tools animate to the exact row: `target` may be a function of the call's arguments (done; used by
  `browse_category`, `update_cart_item`, `remove_from_cart`, `select_flight`).
- The polyfill types radio groups as plain strings, so the examples use `<select>` for enums. It now adds `format`
  (`email`, `date`, `uri`) for those input types, and devtools fills them with samples. Follow-up (polyfill): `enum`
  for radio groups.
- The polyfill dispatches an agent's submit without `checkValidity()`, so `required` fields aren't enforced for
  agents; the examples check in the submit handler (`CheckoutForm`). Follow-up (polyfill): validate before an agent
  submit and answer `Error: …`, after checking what native Chrome does.
- "Answer, then navigate / close after the grace" is duplicated in both examples (`apps/*/src/lib/afterAnswer.ts`).
  Follow-up (react, additive): `useToolAnswer().answer(event, result, { then })` or an exported `afterAnswer`.
- Decided 2026-11-10: the provider loads the polyfill itself where WebMCP is missing, in production too (`polyfill={false}`
  for native only), so deployed demos have their tools in every browser; no app imports it or gates rendering on it. Phase 5 mounted `<AgentChat />` in all three apps (bottom-left in dev, opposite the devtools; bottom-right in prod).
- The open chat panel sits in a corner and can cover the control a confirm-gated tool waits on ("Show me" scrolls it
  into view but doesn't move the panel). Follow-up: collapse or shift the panel while a card is awaiting confirmation.
- In-browser models: 0.6–0.9 GB downloads by default (done in Phase 6: opt-in card, determinate progress, Cancel, Cache API +
  `navigator.storage.persist()`). The build also emits ONNX Runtime's ~27 MB WASM as a static asset (fetched only after
  Download). Small models are weak at multi-step plans: the local adapter caps steps at 4 and ranks ≤ 8 tools.
