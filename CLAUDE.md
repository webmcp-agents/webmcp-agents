# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`web-agents` is a pnpm + Turborepo monorepo of `@webmcp-agents/*` packages for [WebMCP](https://developer.chrome.com/docs/ai/webmcp)
pages (`document.modelContext`). The core idea: make an agent's tool calls **visible** to the person using the page
(ghost cursor, field replay, a parked "confirm" state) without the tools knowing the visual layer exists, and never
compete with the user (the cursor yields the moment they interact). Roadmap and per-phase implementation plans live in
`.agents/plans/` (`00-web-agents-roadmap.md` is the source of truth for package names, public contracts and versions).

---

## Tech Stack

| Technology | Purpose |
|---|---|
| TypeScript ~6.0 (not 7: tooling) | everything, `strict`, `verbatimModuleSyntax` |
| pnpm 11 workspaces + Turborepo 2 | monorepo, task graph (`build`, `dev`, `typecheck`, `test`) |
| tsdown | library builds (`dist/*.js` + `.d.ts`, ESM only), runs publint |
| Vite 8 + React 19 | apps (`apps/*`); packages declare React as a peer when they need it |
| Vitest 5 (node + browser mode via Playwright/Chromium) | tests |
| Biome 2 | lint + format (Markdown excluded) |
| Blume 2 (Astro) | docs site (`apps/docs`), renders `docs/` |

---

## Commands

```bash
pnpm install
pnpm dev                                   # every app with HMR into package source: playground :5173, ecommerce :5174, flights :5175,
                                           # nextjs :5176, the website (landing + docs) :4321
pnpm check                                 # biome ci + typecheck + test + build + size (what CI runs)
pnpm --filter @webmcp-agents/core size        # core bundle budget (min+gz): visuals-only ≤ 10.45 KB, whole package ≤ 18.4 KB
                                           # (the polyfill chunk, loaded on demand, is reported, not counted)
pnpm typecheck | pnpm test | pnpm build    # via turbo
pnpm lint / pnpm format                    # biome
pnpm turbo run check-exports               # publint + are-the-types-wrong on every package (CI runs it)
pnpm changeset                             # describe a change to a published package
pnpm release [patch|minor|major]           # local release (scripts/release.mjs): bump + gate + npm publish + push; no CI job
                                           # publishes. --dry-run, release:version / :publish / :snapshot / :status
pnpm e2e                                   # Playwright e2e of examples/ecommerce, examples/flights and examples/nextjs (not part of pnpm check)
pnpm registry:build                        # shadcn build → apps/docs/public/r/*.json (the docs build runs it; pnpm check adds registry:typecheck + registry:test)
pnpm capture                               # docs/media/**: stills + clips of the four apps via Playwright's Chromium + ffmpeg (not in pnpm check)
pnpm --filter @webmcp-agents/core test        # one package
pnpm --filter @webmcp-agents/docs dev         # the website on :4321 (landing at /, docs under /docs; also started by pnpm dev);
                                           # `test` = blume validate (links), `typecheck` = tsc over the landing's components
pnpm --filter @webmcp-agents/core exec vitest run --project core:unit      # node tests only
pnpm --filter @webmcp-agents/core exec vitest run --project core:browser   # Chromium tests only
pnpm exec playwright install chromium      # once, for browser-mode tests
```

---

## Project Structure

```
examples/               the example apps, all on shadcn/ui from examples/ui. Each keeps everything agent-side in webmcp-agents/
                        (src/webmcp-agents in Vite apps, webmcp-agents/ in Next.js): agents.ts (defineWebAgent), tools/ (one
                        defineWebTool per file + index.ts, the catalog, whose header maps where every tool lives), components/
                        (components that own a tool's state and call useWebTool inline: forms, search). A defined tool that is
                        on only while a component is open is not in the catalog: the component calls useWebTool(tool, { enabled }).
                        Docs are the source of truth for the examples: change the code to match them.
examples/ui/            @webmcp-agents/examples-ui (private, source only): the shadcn/ui components (base-nova, Base UI, lucide,
                        Tailwind v4) every example imports as @webmcp-agents/examples-ui/components/<name>, and styles.css (an
                        app's CSS imports it + `@source "../"`). Components import each other relatively; `shadcn add` from
                        examples/ui writes `@/` imports that must be made relative.
examples/playground/    demo storefront; every action is a WebMCP tool (useWebTool + React Hook Form, an app-wide catalog with `match`,
                        one declarative form as the alternative)
examples/ecommerce/     "Field Store" example (React Router 7): an app-wide catalog, component tools (the cart drawer's exist only
                        while it is open), confirm-gated checkout; data/ (mock JSON + pure queries), store/ (module stores: cart,
                        ui, cart-rules), lib/navigate.ts (the router's navigate for module tools), e2e/ (Playwright)
examples/flights/       "Skyline" example: search in the URL, results tools with `match` on the results route, forms on React Hook
                        Form (traveler details on TanStack Form), confirm-gated booking
examples/nextjs/        "Field Store on Next.js" (App Router, port 5176): Server Components render pages, client components hold
                        the tools, the chat is the registry's agent-chat block, lib/env.server.ts taints the key. tsconfig maps
                        `@/components/ui/*` to examples/ui for the registry blocks. Consumes the packages' dist (predev builds
                        them); app/layout.tsx imports @webmcp-agents/core/cursor.css.
apps/docs/              @webmcp-agents/docs (private, port 4321): the one website, a Blume site. The docs are ../../docs, mounted
                        under /docs (`basePath`; edit content in docs/). The home page is the landing: pages/index.astro (its own
                        document, not Blume's PageLayout) hydrates components/landing/landing.tsx as one React island, styled by
                        landing.css (a second Tailwind entry: shadcn tokens). Sections are OpenDesigns blocks
                        (components/opendesigns/**, installed from the user's hub with `shadcn add @opendesigns/<block>`; the hub
                        needs OPENDESIGNS_TOKEN in the env, see components.json) over components/ui (shadcn, React Aria).
                        pages/demos.astro (/demos) hydrates components/landing/demos.tsx the same way: the recorded clips
                        (demos-data.ts) in browser frames; pages/docs/demos.astro redirects the docs header's Demos link.
                        Business and UI apart, like the examples: webmcp-agents/tools/<id>.ts (one defineWebTool from core per
                        file; index.ts: the homeTools/demosTools catalogs + a map of every tool), webmcp-agents/hooks/ (hooks
                        that call tools: use-agent-layer (ready + onReady + use-intro, the first-visit show_tools call),
                        use-tools-ready (invokeWhenReady), use-try-it (the hero's chips), use-linked-demo (/demos#<id> replays
                        it)); hooks/use-*.ts (docs search, copy buttons, FAQ open question, theme toggle, typed word); lib/
                        (React-free: docs-search store + Blume search client, clipboard, faq event, demo-frame lookup/replay,
                        outline, tools-row, when-idle, call-code). components/landing/*.tsx only take props and call hooks
                        (agent-layer.tsx: the provider, which brings the devtools in dev; landing.tsx / demos.tsx pass it
                        the catalog, the one wiring point); *-data.ts there is plain data. Consumes the packages' dist (predev builds them). scripts/record-demo.sh <demo>
                        re-records public/demo (agent-browser); theme.css gives the docs the landing's dark palette;
                        public/r/ is the built shadcn registry (gitignored; `build` runs `registry` first, so every host serves it)
registry/               the @webmcp-agents shadcn registry: registry.json + default/<item>/<item>.tsx (agent-chat, agent-tool,
                        agent-subagent, agent-reasoning, agent-model-selector); copies live in examples/nextjs/components/web-agents
                        and must stay identical (registry/test checks it)
packages/core/          @webmcp-agents/core: visuals (cursor.ts, motion.ts, visuals.ts), events.ts, user-yield.ts,
                        webmcp.ts (global WebMCP types), cursor.css (shipped as @webmcp-agents/core/cursor.css; cursor-native.css, optional,
                        holds Chrome's native-pseudo-class rules),
                        web-tool.ts (defineWebTool, tool.invoke, a call's Stage), locate.ts (controls by role + name, a parameter's
                        field), write.ts (writing a native control), web-agents.ts (createWebAgents, URL tracking, `match`,
                        inspectTools and currentAgentVisuals for the devtools; loads the polyfill), registry.ts, confirm.ts, deferred.ts (deferred
                        release + call tracking), model-context.ts (loadWebMCPPolyfill, whenModelContext, the queue a tool
                        registered before document.modelContext waits in), polyfill/ (the document.modelContext polyfill +
                        declarative forms, its own chunk; exported as @webmcp-agents/core/polyfill and /polyfill/auto)
packages/react/         @webmcp-agents/react: <WebAgentsProvider> (a wrapper over createWebAgents; installs the devtools in
                        development, `devtools` prop), useWebTool({…}) → { invoke }, useEnableTools, useToolAnswer, JSX attr
                        types. Depends on @webmcp-agents/devtools (a regular dependency)
packages/polyfill/      @webmcp-agents/polyfill: deprecated, re-exports @webmcp-agents/core/polyfill (+ /auto)
packages/chat/         @webmcp-agents/chat: <AgentChat> (components/), AgentAdapter types, agent.ts (defineWebAgent: instructions,
                        tool subsets, sub-agents; /agent entry, isomorphic), createCloudAdapter (adapter/cloud.ts: the model ↔ tool loop,
                        adapter/wire.ts: AI SDK UI message stream), session/ (run-agent.ts: the one model ↔ tool run behind
                        useAgentSession, useWebAgent and agent.invoke; reducer; nested delegate runs),
                        /server (createChatHandler on an AI SDK ToolLoopAgent: server/web-agent.ts; server/models.ts resolves
                        "<provider>/<model>" ids), /vite (webAgentsChatDev), chat.css
packages/local-agent/   @webmcp-agents/local-agent: createLocalAdapter (index.ts), loop.ts (shared on-device agent loop),
                        tool-call-parser.ts, tools.ts (rank/compact/validate), providers/transformers (worker + engine +
                        main-thread provider), providers/prompt-api (Chrome LanguageModel)
packages/vercel-api/    @webmcp-agents/vercel-api (private): createVercelChatRoute for examples/*/api/chat.ts — origin, per-IP
                        rate limit (Upstash or in-memory) and daily budget guards around the chat handler
packages/devtools/      @webmcp-agents/devtools: store.ts (tools, calls, settings), schema-form/ (JSON-Schema form), ui/ (React
                        panel in a shadow root), vanilla.tsx (installWebAgentsDevtools), react.tsx (<WebAgentsDevtools />,
                        TanStack plugin), event-client.ts, inspect.ts (a tool's resolved control, fields, match and flags in
                        words, from core's inspectTools); window.agent.invoke (run is an alias). Never imports
                        @webmcp-agents/react (react depends on devtools): the cursor comes from core's currentAgentVisuals()
packages/tools/         @webmcp-agents/tools: one factory per common tool (get-time.ts, get-location.ts, get-page.ts, go-to.ts,
                        go-back.ts, scroll-to.ts, set-theme.ts; calendar.ts is pure), each a defineWebTool tool, no framework
capture/                the docs media harness: playwright.config.ts (webServer for the four apps; stills, mobile, clips
                        projects), *.capture.ts, encode.mjs (ffmpeg → docs/media, budgets: clips ≤ 1.5 MB, hero.gif ≤ 3 MB)
docs/                   the docs site's content (apps/docs renders it), ordered by framework and by step (docs/README.md
                        "How these docs are written"): (get-started)/ (index.mdx, installation/ with one page per framework),
                        build/ (the eleven-page path), concepts/, security/ (locking /api/chat: sessions, tool allowlist, Turnstile, limits),
                        more/ (incl. deploy.md), examples/, reference/<package>/<api>.md
                        (one file per public API, one template); _examples/ holds the code the pages show as real files that
                        type-check (`@webmcp-agents/docs-examples`), pulled in with <include>; framework-specific code sits in
                        <View> blocks titled Vite, Next.js, TanStack Start, Astro. Update reference/ with the API, and the
                        Build/concept page a change affects. Each folder has a meta.ts (sidebar title + page order); reference
                        READMEs set `slug: reference/<pkg>`. apps/docs/scripts/check-docs.mjs enforces the conventions.
.agents/plans/          roadmap + phase plans (execute with /execute <plan>)
tsconfig.base.json      shared compiler options (incl. customConditions)
```

---

## Architecture

- **Tools are pure.** Tools (`examples/*/src/webmcp-agents`) never import visuals. A tool is `execute` plus an optional
  `target`: nothing is added to the JSX for the cursor. The control is found by role and accessible name (the tool's `title`,
  or its id read as words; `locate` in core), or by an explicit `target`; each parameter is typed into the field with that
  `name` or label. `toolname="<id>"` markers still work as a fallback, and declarative forms are made of them.
- **The visual layer is event-driven.** `installAgentVisuals()` (packages/core/src/visuals.ts) listens to `input`
  (capture), `submit` with `agentInvoked` (capture), `toolactivated`/`toolcancel` (on `document.modelContext`, or
  `window` before Chrome 156) and trusted user input. In `sync` mode it holds agent fills/submits and wraps
  `registerTool` so the page reacts at the cursor's click. Native Chrome and the polyfill fire events in different
  orders; runs start on whichever signal arrives first.
- **Lifecycle.** Installs are ref-counted; `destroy()` on the last handle removes all DOM, listeners, timers and restores
  `registerTool`. A detached `GhostCursor` never rebuilds DOM and fast-forwards (behaves like "yielded").
- **Events.** `onAgentEvent` delivers `start | fill | park | result | error | cancel | yield | resume`; the `log` option
  gets the same payloads. Devtools and the chat widget (later phases) build on this, not on internals.
- **Never unregister a tool synchronously from UI code.** Chrome cancels a call whose tool changes; React remounts on
  purpose. Release through `deferRelease` + a `CallTracker` (the registry and `useWebTool` do), so StrictMode and route
  swaps cause no `toolchange` churn and in-flight calls finish first.
- **Only core (which holds the polyfill), devtools and chat touch `document.modelContext`.** WebMCP is an origin-trial
  API whose shapes move; keep feature detection in those packages. UI that reads the tools and may start before the
  polyfill (devtools, chat) binds through `whenModelContext`, never by reading `document.modelContext` once.
- **The provider loads the polyfill; nothing waits for it but the tools.** `createWebAgents` (so `<WebAgentsProvider>`)
  `polyfill: "auto"` (default) loads `src/polyfill` by literal dynamic `import()` where `document.modelContext` is
  missing, in production too; `false` never loads it. While it loads, `registerWebTool` queues registrations (in order;
  an unregister before then cancels) and createWebAgents installs the cursor before any of them register (the cursor
  binds to `document.modelContext` when it installs). Apps render on first paint: no "ready" gate, no polyfill import.
- **The provider loads the devtools in development.** Dependency direction: react → devtools → core (never devtools →
  react, or Turbo has a cycle). `<WebAgentsProvider devtools>` (default on) imports `@webmcp-agents/devtools` inside
  `if (process.env.NODE_ENV === "development")` and installs it with its own `agents.visuals`; one panel per page,
  ref-counted, released with `deferRelease`. `createWebAgents` cannot (core is below devtools): a no-framework page
  calls `installWebAgentsDevtools()` itself. Apps have no devtools code; `devtools={false}` + `<WebAgentsDevtools />`
  places it by hand (the playground's `?tanstack`).

---

## Code Patterns

### Naming & files
- kebab-case files, camelCase functions, PascalCase types/classes, `XxxOptions` for option bags.
- TSDoc `/** … */` on every export and every option (explain *why*, and defaults).
- Section banners inside long functions: `// ---------- n. title ----------`.
- Short "why" comments; don't narrate what the code does.

### Packages
- `exports` use the custom condition `"@webmcp-agents/source": "./src/….ts"` first, then `types`/`import` → `dist`.
  Apps set `resolve.conditions: ["@webmcp-agents/source", ...defaultClientConditions]`; `tsconfig.base.json` sets
  `customConditions`. So dev and typecheck use source; never import from another package's `src/` by path
  (core's own tests import its polyfill by relative path; other packages' tests import `@webmcp-agents/core/polyfill`).
- Packages that need WebMCP types import them by name from `@webmcp-agents/core` (`import type { ModelContext } …`), which
  also pulls the global declarations into their emitted `.d.ts`.
- No DOM access at import time (SSR-safe); `typeof document === "undefined"` → no-op.
- Library UIs (devtools, chat) put `data-web-agents-ui` (`UI_HOST_ATTR`) on their host so input there never yields the cursor.

### Visuals / motion
- Transforms and opacity only; one rAF loop; springs and minimum-jerk timing live in `motion.ts`.
- Every animation has a reduced-motion path (`reduced()`, `wait()` collapse to 0).
- Write fields like a user: native value setter + `input`/`change` events (React sees them).
- Only `isTrusted` input may count as the user.

### Tool descriptions
- Every tool (imperative `description`, declarative `tooldescription`) says: what it does and answers, when to use
  it, what it needs first (another tool, or the page it lives on), and what comes next. Parameters say where a value
  comes from, with an example. See `packages/react/README.md` "Writing tool descriptions".

### Errors
- A tool's failure is a readable result for the agent and the same text on the page, with an error code:
  `"Error [code]: …"` + `structuredContent.error` (`toolError`, `WebToolError`; codes in packages/core/src/result.ts).
  A tool waiting on the person calls `waitingForUser` so the agent's 30 s tool timeout doesn't fire.
- Event listeners must never break a tool run (`emit` catches and logs).

---

## Testing

- `*.test.ts`: Node environment, pure logic (motion, events, SSR import).
- `*.browser.test.ts`: real Chromium via Vitest browser mode; use `userEvent` from `vitest/browser` for **trusted**
  input (required for yield tests); targets must sit inside the ~414 px-wide test viewport.
- Helpers in `packages/core/src/test-utils.ts`: `fixture`, `toolForm`, `uniqueName` (the polyfill registry lives for
  the whole page, so tool names must be unique per test), `recordEvents`, `until`.
- Always `destroy()` visuals and remove fixtures in `afterEach`.
- The test helpers install the polyfill on import. A test of a page *without* `document.modelContext` (the provider
  loading the polyfill, `polyfill: false`) is a file of its own that imports no helper: each browser test file gets a
  fresh page (`web-agents.polyfill.browser.test.ts`, `provider.polyfill.browser.test.tsx`).
- Example apps: `examples/*/e2e/*.spec.ts` (Playwright, desktop + Pixel 7, reduced motion so the cursor snaps) drive
  tools through `window.agent` (`e2e/agent.ts`); a confirm gate is asserted with `.agent-cursor.is-waiting` + `data-agent-active` on the control, then a
  real click (`parkedOn` in `e2e/agent.ts`). Apps typecheck twice: `tsconfig.json` (src, `vite/client`) and `tsconfig.node.json` (configs + e2e).

---

## Validation

Before finishing any change: `pnpm check`. For visual changes also run the playground and drive a tool
(`agent.invoke("add_to_cart_mug-01", { qty: 3 })` in DevTools, or the agent-browser skill), including scrolling or clicking
mid-run (the cursor must vanish and the tool still complete).

---

## Gotchas

- Install with pnpm only. `bun install`/`bun add` ignore `pnpm-workspace.yaml` (overrides, allowBuilds), fill
  `node_modules/.bun` and write a `bun.lock` that then wins lockfile detection (shadcn, ni) over `pnpm-lock.yaml`;
  Vite's dep scan then crawls packages' own tests ("@testing-library/react … could not be resolved"). `bunfig.toml`
  points bun at a registry that does not exist so its installs fail before writing anything; `bun dev` / `bun run` still
  work. If `node_modules/.bun` or a `bun.lock` ever appears: delete them and every `node_modules`, then `pnpm install`.
- Chrome cancels a call whose tool definition changes mid-flight. A `useWebTool` tool is kept registered until its call is
  answered, so a tool that disables itself (`clear_cart` emptying the cart) still answers; only a declarative form that
  hides itself after its own action needs `useToolAnswer` to stay rendered (the playground's `apply_promo`).
- The agent-browser CLI's Chrome draws no frames on this machine (rAF never fires, screenshots time out, `record start`
  hangs), which freezes the cursor and every gated tool. Launch it with software compositing:
  `agent-browser --args "--disable-gpu,--disable-gpu-vsync,--disable-frame-rate-limit,--disable-backgrounding-occluded-windows,--disable-renderer-backgrounding,--disable-background-timer-throttling" open <url>`
  (`apps/docs/scripts/record-demo.sh`), or drive the app with Playwright's Chromium (`node_modules/playwright`).
- `executeTool` arg shapes differ by Chrome version (object vs JSON string); use core's `executeTool()` (`packages/core/src/execute.ts`),
  never `document.modelContext.executeTool` directly from library UI.
- The provider's devtools check must stay literally `process.env.NODE_ENV === "development"` around the `import()`,
  inside the effect (not a helper, not `globalThis.process?.…`): bundlers replace that exact expression and only drop a
  branch, and its chunk, that is dead where the `import()` sits. It is wrapped in try/catch for pages without a bundler.
  `packages/react` builds with tsdown `platform: "neutral"`: `"browser"` replaces `process.env.NODE_ENV` at library build
  time. Under NODE_ENV "test" (Vitest, an app's tests) there is no panel; react's devtools test runs in its own Vitest
  project with `define` NODE_ENV "development" (`vitest.config.ts`).
- The devtools hotkey (Alt+Shift+A) is a trusted keydown on the page, so pressing it makes the cursor yield like any
  other key; drive tools ~1 s later in scripted checks (input inside the panel itself never yields).
- Example apps keep the cart / booking in a module store (`src/store/*.ts`, read in React with `useSyncExternalStore`), so
  catalog tools read it directly and back-to-back agent calls see each other; a tool that navigates uses the router's own
  `navigate`, handed over once by `main.tsx` to `src/lib/navigate.ts` (Next.js: `app/providers.tsx`). There is no provider
  `context`. A form tool that navigates does it in `execute`; `useWebTool` keeps the tool registered until it has answered.
- `match` turns a tool on as soon as the URL changes, which can be before the new route has rendered: a tool must not
  assume its page's state is there yet (Skyline's `search_flights` stores the query before it navigates). URL-change
  notices are delivered just after the navigation call returns (a microtask): Next.js changes the URL inside a React
  insertion effect, where telling React (a store listener, a tool registering) is an error.
- Many buttons with the same text need accessible names that say which (`aria-label="Add to cart: <name>"`, starting with the
  visible text), so a tool's `title` finds exactly one; a confirm-gated tool fails closed when its name matches several
  controls. Icon-only buttons need an `aria-label`.
- `@webmcp-agents/chat` runs one model step per request; tools run in the browser between steps. After each tool call (and
  before a run) the session waits for the page's tools to settle (`toolchange` quiet for ~150 ms), or a navigation's new
  tools miss the next request. Claude Opus 5.5 can't disable thinking: signed reasoning is kept in the history
  (`AgentPart` "reasoning") and sent back; `maxOutputTokens` must leave room for it.
- `docs/media/**` is generated: change a capture spec and run `pnpm capture` (ffmpeg on PATH); never hand-edit. Chat
  stills that need a live model are skipped without a key in `examples/ecommerce/.env.local`. Clips are `<video>` with
  WebM + MP4 sources in `.mdx`; stills are relative PNGs (Blume converts them to WebP).
- Edit the registry blocks in `registry/default/**`, then copy them to `examples/nextjs/components/web-agents/`
  (`cp registry/default/*/agent-*.tsx examples/nextjs/components/web-agents/`): the registry test fails when they differ.
  The blocks import `cn` from the `cn` package and primitives from `@/components/ui/*`, as shadcn's base style does
  (resolved to `examples/ui/src/components` by tsconfig paths in examples/nextjs, registry/ and docs/_examples).
- The landing's blocks (`apps/docs/components/opendesigns`) come from the OpenDesigns registry (`apps/docs/components.json`):
  `OPENDESIGNS_TOKEN=… pnpm dlx shadcn@latest add @opendesigns/<block>` inside `apps/docs`. The token is personal and never
  goes in the repo. The installed copies are ours to edit (reworded labels, slots); Biome ignores
  `components/opendesigns`, `components/ui`, `landing.css` and `pages/` (it cannot see an Astro template's use of its
  frontmatter). Their `@/…` imports resolve through an alias set in `blume.config.ts` (Blume's Astro root is `.blume/`).
- The landing and the docs are two stylesheets on purpose: shadcn and Blume both name tokens `--background`, `--muted`,
  `--accent` with different meanings. What they share comes from Blume: the fonts (`theme.fonts`, `--blume-ff-geist`), the
  favicon, and the theme (`data-theme` on `<html>`, `localStorage["blume-theme"]`; `lib/theme.ts` writes the same key).
- React Aria's press handling re-fires a `click()` when the trusted click was stopped; core's confirm gate swallows that
  scripted click for 300 ms (`REFIRE_MS`), so a `requireConfirmation` tool on a React Aria `Link`/`Button` does not follow
  its link after the person's click. The cursor finds such controls by name like any other (no attribute is needed).
- The cursor never presses out of sight: `moveTo` scrolls a target outside the viewport (or within 64 px of its edge)
  to the middle and resolves only once the target is in view (`REVEAL_MS` cap), the hand waiting at the viewport's
  edge meanwhile. A target in a sticky / fixed box that is already in view never scrolls the page. After a click the
  hand rests on the control (`rest`) and hides as soon as the control is not under it any more (covered, moved,
  removed, hidden). A parked run follows its control (`followParked` in visuals.ts: the tool's `target` is resolved
  again every 400 ms, and on resume the cursor returns to it); the confirm gate fails with `unavailable` once no
  usable control is left, CSS-hidden included (it polls: a container query mutates nothing). The gate also gives up
  after 10 s (`CONFIRM_TIMEOUT_MS`, `needs_user`), and a call the person starts themself (one that begins within 1 s
  of a trusted click elsewhere: a chip, the devtools' Run) cancels every waiting confirmation (`supersedeWaiting`,
  `cancelled`); an agent's own next call never does, the cursor just returns to the waiting control afterwards. The
  person moving on cancels it too: a trusted pointerdown off the control (given effect 150 ms after the pointerup, so
  a chip's own call supersedes it by name first), a wheel (a gesture already coasting when the gate started is
  ignored until a 200 ms gap), a touchmove, or a scroll key on the body; input inside `[data-web-agents-ui]` never does.
- The cursor scrolls its target to the middle of the viewport when the target is within 64 px of the fold; `show_demo`
  targets a demo frame element (`demoFrame(id)`, a function `target` returning an Element). On the Demos page a frame is
  header-wide unless the window is too short to show all of it (`landing.css`, `.demo .demo-well`).
- Blume mounts every internal header link under `basePath`: the docs header's Demos action is `/docs/demos`, a
  redirect page (`pages/docs/demos.astro`) to `/demos`.
- `scripts/record-demo.sh` waits for the cursor's own parked state (`.agent-cursor.is-waiting`) before the trusted
  click: native Chrome sets `:tool-submit-active` as soon as a call starts, before the cursor has typed.
- There is one hand. `moveTo` resolves `false` when another call's move took it; visuals.ts moves through `go(run, el)`,
  which marks the run `lost`: it then plays unseen (values written in one step, no ring, no press) and never takes the
  hand back, except a run parked for the person, which gets it back when the other call finishes (`followParked`).
  New cursor steps in visuals.ts go through `go`, never `agentCursor.moveTo` directly (only `followParked` does).
- A press lands on the frame that draws the hand at the bottom of its scale spring (`PRESS_AT`; `update` ends the
  wait), so the ripple and the page's reaction paint together; `wait()`s under way end when the cursor yields.
- A password field is typed like any other, but its value is `"••••"` in the live region and in the `fill` event.
- A backgrounded tab (`document.hidden`) counts as "yielded": calls run at once, nothing animates. A hidden Browser
  pane that reports itself visible but fires no rAF is slower, not stuck: each move lands by timer (`STALLED_MS`
  after it should have). Show the pane before driving the site's tools there if you want to see or time the cursor.
- Nothing gates rendering on the polyfill, so Next.js prerenders every page inside `<Providers>`: a client component that
  calls `useSearchParams()` needs a `<Suspense>` boundary (`examples/nextjs/app/cart/page.tsx`), or `next build` fails.
- Playwright's `page.waitForFunction` does not await an async predicate (a Promise is truthy): wait for `window.agent`,
  then `expect.poll(() => list(page))` for the tools (`examples/*/e2e/agent.ts` `open`). The tools register a few ms after
  `window.agent` exists in a browser without WebMCP, once the polyfill the provider loads is there.
- `cursor.css` must stay free of unknown pseudo-classes (Turbopack fails the build on one): Chrome's native `:tool-form-active` / `:tool-submit-active` rules live only in the optional `cursor-native.css`, one rule each.
- Agents: `defineWebAgent` is plain shared data; the browser sends only the agent **id** and the server reads
  instructions from `createChatHandler({ agents })` (also `webAgentsChatDev({ agents })` in dev: dev `/api/chat` never
  goes through `api/chat.ts`). Sub-agents are client-executed `delegate_to_<id>` tools run by the session on the same
  adapter; never a server-side loop (page tools must run in the browser).
- Model ids are `<provider>/<model>`; a provider's `@ai-sdk/*` package is an optional peer loaded with a literal
  `import()` only when its key is set; `openrouter/<vendor>/<model>` ids split at the first slash; bare `claude-…` ids
  never reroute to the gateway (dash vs dot catalogs).
- `webAgentsChatDev` refuses to start `vite dev` when a `VITE_*` variable is named like a secret (`*_API_KEY`,
  `*_SECRET`, `*_TOKEN`): Vite inlines every `VITE_` variable into the client bundle. Keys stay server-side, unprefixed.
- The on-device model's "is it cached?" answer comes from transformers.js in the worker
  (`ModelRegistry.is_pipeline_cached`, per dtype and device), never from localStorage. A cached model loads with
  `AdapterStatus` `loading` (with `progress`), a real download with `downloading`: the chat words them differently.
- `@webmcp-agents/local-agent` loads transformers.js only inside its worker (`new Worker(new URL("./worker.ts", …))` in
  source; a tsdown plugin rewrites it to `./worker.js` in dist). Apps need `optimizeDeps.exclude` for the package and
  transformers, and `worker: { format: "es" }`. pnpm denies the install scripts of transformers' Node-only deps
  (`allowBuilds` in pnpm-workspace.yaml). Unit tests never download a model.
- Node-environment Vitest tests that import *another* workspace package at runtime need
  `ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } }`, else they load its stale `dist`.
- Vercel's function bundler resolves `api/chat.ts` imports with default conditions (`dist`, not `src`): a package used
  there must build what its `exports` name (tsdown `platform: "node"` emits `.mjs`; publint in the build catches it).
- Library CSS is unlayered on purpose: an app's plain `button { color: inherit }` beats any `@layer` rule.
- Only `packages/chat/src/server/**` may import a provider SDK (`@ai-sdk/*`, `@openrouter/*`; Biome `noRestrictedImports` override).
- Example drawers/sheets are non-modal (`role="dialog"` + `inert` page), never `showModal()`: the top layer would hide
  the agent cursor and make the devtools inert.
- Devtools browser tests pre-bundle React in `optimizeDeps.include`; a dependency discovered mid-run reloads Vite and
  leaves two copies of React ("Cannot read properties of null (reading 'useState')").
- The docs site (`apps/docs`, Blume): `blume build` refuses while `blume dev` runs (they share `.blume/`), so stop
  `pnpm dev` before `pnpm check`. Reference pages stay `.md`; in `.mdx` pages a bare `{` or `<` in prose is JSX (keep them in backticks). A new package folder in `docs/`
  needs a README `slug` and a `meta.ts`; a new page goes in its folder's `meta.ts` `pages`. `pnpm-workspace.yaml` overrides `satteri` for `blume` (two copies break every
  page). `blume check` crashes (native type-checker), so the app's `typecheck` is plain `tsc` over the landing's components.
  `apps/docs/turbo.json` makes `docs/**` a build input; Turbo would otherwise replay a stale cached site. Blume's
  `<Steps>` body is `not-prose`, where a code block loses its header (and file name): the installation pages use
  `##` headings in `<div class="install-steps">` instead. A code block's title does not survive inside `<Steps>`;
  `<include>` of a code file does work inside `<View>` and in `.md` pages. Old docs routes redirect
  (`redirects` in `blume.config.ts`, mirrored in `apps/docs/vercel.json`).
