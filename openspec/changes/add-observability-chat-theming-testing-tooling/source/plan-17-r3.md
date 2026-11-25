# Change: `add-observability-chat-theming-testing-tooling`

Target release: **0.5.0** · Baseline: **v0.4.0** (`91db96d`, chat restore included)
Repo: https://github.com/webmcp-agents/webmcp-agents · Site: https://webmcp-agents.dev/

This is `plans/17-openspec-change-0.4.0.md` in full, revision 3: every section, table and code block of revision 2
is kept, and the errors found by reviewing it against the repo are corrected in place. Each correction is marked
**[R3]** where it happens and listed in §0. Code blocks are **the contract to implement** unless marked *illustrative*.

Read before starting: `CLAUDE.md`, `.agents/plans/00-web-agents-roadmap.md`.
Gate after every phase: `pnpm check && pnpm turbo run check-exports`.

How this becomes the change: §1, §2, §11, §13 → `proposal.md`; §3 to §9 → `design.md` (code blocks and tables
unchanged); every `R-*` requirement → its `specs/<capability>/spec.md`; §10 → `tasks.md`; §14 is how it is delivered.

---

## 0. Revision 3: what the review against the repo changed

The plan was written against v0.3.0. The repo is at v0.4.0 (published; chat restore shipped in it).

| # | Revision 2 said | The repo today | Correction (marked [R3] below) |
|---|---|---|---|
| 1 | Target 0.4.0, baseline 0.3.0 | every published package is 0.4.0, tags exist | Target **0.5.0**, baseline 0.4.0. "0.3.0" in compatibility rules now reads "0.4.0 and earlier" |
| 2 | "supersedes `16-observability.md`"; "span shapes are those of plan 16" (§7.5) | there is no plan 16 in the repo (`.agents/plans` ends at 15) | The span tree is written out in §7.5. If plan 16 exists elsewhere, add it to `plans/` and it is reconciled |
| 3 | 17 `--wa-chat-*` variables | 18 (`--wa-chat-success`); 36 declarations | all 18 old names stay as fallbacks, mapping table in §5.3 |
| 4 | `ChatPart` / `ChatMessages` / `ChatComponents` | 0.4.0 added restore (button, confirm, cancel), a resize handle, a status line, a "working" indicator, a default suggestion; none had a key | keys and parts added in §5.1 (found by listing every string in `packages/chat/src`) |
| 5 | errors: nine codes | `run-agent.ts` also says "The agent run was aborted." / "…failed."; `AgentStreamPart` error `code` is a closed union of four | `aborted` and `run_failed` added; the `code` union is widened (additive) |
| 6 | `colorScheme` prop | the chat already follows `[data-theme]` on itself or any ancestor, then `prefers-color-scheme` | `colorScheme: "auto"` keeps exactly that; `light` / `dark` set `data-theme` on the root (§5.1) |
| 7 | the "no raw values in chat.css" test sits in a browser test and calls `readFileSync` | browser tests have no `fs` | it is a Node test, `chat-css.test.ts` (§5.4) |
| 8 | core whole-package budget 18.4 KB | 18.5 KB since restore (`packages/core/scripts/size.mjs`) | 10.45 KB / 18.5 KB |
| 9 | redaction key rule "equals or ends with" | `timespan`, `japan`, `spin` end with `pan` / `pin` | match by trailing **words** of the key, not trailing characters (§8.1, §8.4) |
| 10 | sketch calls `custom` on every node; the test expects `{ a: "[REDACTED]" }` from a throwing `custom` | at the root the sketch would return `"[REDACTED]"` for the whole object | `custom` runs on keyed values only; the test passes as written (§8.4) |
| 11 | URL test expects `token=[REDACTED]` | `URLSearchParams` would write `%5BREDACTED%5D` | the query is rebuilt by hand; noted in §8.5 |
| 12 | 12 console call sites in chat + core | 17 `console.error` / `warn` (chat 9, core 6, devtools 1, react 1), plus 2 `console.info` in core | sink 7 covers the list in §8.3 |
| 13 | sinks 1 to 9 | restore keeps the conversation and snapshots in `sessionStorage`; a `fill` event's `from` is withheld for passwords only | row 10 added; `from` follows `isSensitiveControl` (§8.3) |
| 14 | private helpers: five places, "three `fakeAdapter`s" | also `packages/devtools/src/test-utils.ts`; **five** `fakeAdapter`s; 38 test files import them (core, chat, devtools, react) | §9.1 and R-TEST-5 list them all |
| 15 | peer `vitest >=3` | the browser project uses `playwright()` from `@vitest/browser-playwright` (Vitest 4+); the repo is on 5.1 | peer `vitest >=4`, `@vitest/browser-playwright` optional (§9.2) |
| 16 | konsistent `example-agent-layer`: `examples/{app}/src/webmcp-agents` must have `agents.ts` | playground has no `agents.ts`; Next.js keeps the folder at `examples/nextjs/webmcp-agents` | the rule is split (§4.2) |
| 17 | konsistent `published-package-shape` on every package | `packages/vercel-api` has no `README.md` | a README is added in phase 0 |
| 18 | `flush: provider.forceFlush()`; "a global provider the app registered" | the API's `TracerProvider` type has no `forceFlush`, and `trace.getTracerProvider()` always returns a proxy, registered or not | both are feature-detected (§7.4); added to §12 |
| 19 | R-EXP-7: `OTEL_SDK_DISABLED=true` disables both sides | a browser cannot read server env | the server exports nothing and the relay accepts and drops; the browser side is turned off with `enabled` (§7.9) |
| 20 | decisions numbered 1 to 5, 9, 6 to 8 | | same nine decisions, in order |
| 21 | phases 3 ∥ 4; stacked PRs | both phases edit `adapter/cloud.ts`, `session/run-agent.ts`, `server/handler.ts`; you asked for one PR | 3 then 4; one PR, commits per phase (§10, §14) |
| 22 | sink 6 redacts every query value of `page.url` and the page-move note, both read by the model | rule 9 and §11 say the model keeps what it needs; Skyline keeps its search in the URL | two strengths of URL redaction: strict for telemetry and logs, sensitive-only for the model (§8.3 row 6). **Needs your sign-off** |
| 23 | the kit's `runs`, `spans`, `./telemetry`, `toHaveSpan`, `toHaveNoHardcodedText`, `renderChat` are phase 2 | they need `onAgentRun` (phase 4), the telemetry package (5) and the customization props (3) | phase 2 ships their shells and types; tasks 3.9, 4.6 and 5.5 complete them (§10) |

---

## 1. Why

| Problem today (v0.4.0) | Evidence in the repo |
|---|---|
| The chat cannot be restyled or translated without forking | `packages/chat/src/chat.css` has 18 `--wa-chat-*` variables **[R3]**, 183 lines with a raw value and 14 with a physical `left` / `right`; components hold about 45 hard-coded English strings; 5 of 11 components carry a `data-*` hook, none a stable part name; no `messages` / `classNames` / `components` props; `adapter/cloud.ts` `MESSAGES` and `session/run-agent.ts` build English strings |
| A turn is not traceable | one POST per model step (`stepCountIs(1)`), tools run in the browser, the body has no conversation / run / step id, `AgentStreamPart` has no usage |
| No path to an observability backend | the only hook is `prepareAgent`; nothing sets `telemetry` |
| Users are not told how to test tools and agents | test helpers live in `packages/core/src/test-utils.ts`, `packages/devtools/src/test-utils.ts`, `packages/chat/test/` and `examples/*/e2e/agent.ts`, unpublished and undocumented **[R3]** |
| Conventions are enforced by review only | `CLAUDE.md` lists them; nothing checks them; no dead-code check |

## 2. Scope

**In:** six capabilities below. **Out:** evals, user-feedback scoring, metrics (counters/histograms), a devtools
timeline, on-device token usage. All are follow-ups.

| Capability (spec folder) | Delta | Packages |
|---|---|---|
| `repo-tooling` | ADDED | root, CI |
| `chat-customization` | ADDED | `chat`, `registry`, examples |
| `agent-run-telemetry` | ADDED | `chat` |
| `telemetry-exporters` | ADDED | new `@webmcp-agents/telemetry`, `vercel-api` |
| `data-redaction` | ADDED | `core` (`/redact` entry), applied in `core`, `chat`, `devtools`, `telemetry` |
| `testing-kit` | ADDED | new `@webmcp-agents/testing` (on Vitest), docs |

**Revision 2 (2026-11-25).** Changed from revision 1: (a) the closed `observe("<preset>")` API is gone; exporters
follow the OpenTelemetry standard (OTLP targets, standard `OTEL_*` env, any exporter, processor or provider), so a new
backend needs no new type in this repo; (b) redaction is its own capability with one utility applied everywhere data
leaves a tool; (c) testing is one package built on Vitest (fixtures, matchers, mocks), replacing three `/testing` entries.

Suggested OpenSpec layout:

```
openspec/changes/add-observability-chat-theming-testing-tooling/
├── proposal.md            ← sections 1, 2, 11, 13 of this file
├── design.md              ← sections 3 to 9 (decisions + APIs)
├── tasks.md               ← section 10
└── specs/
    ├── repo-tooling/spec.md
    ├── chat-customization/spec.md
    ├── agent-run-telemetry/spec.md
    ├── telemetry-exporters/spec.md
    ├── data-redaction/spec.md
    └── testing-kit/spec.md
```

## 3. Decisions (settled, do not reopen)

1. **No breaking changes.** Every new prop, option and wire field is optional. Old pages work against new servers and the reverse.
2. **Content is never recorded by default.** Prompts, tool inputs and tool results stay out of telemetry on the server and in the browser until the app opts in. (The AI SDK's own default is the opposite, so the handler sets it explicitly.)
3. **No vendor types in this repo.** The public surface accepts only OpenTelemetry-standard things: an OTLP target (endpoint, protocol, headers), any `SpanExporter`, any `SpanProcessor`, any `TracerProvider`, and the standard `OTEL_*` env vars. A backend is a docs recipe, never a code path or a union member.
4. **The library never mutates global telemetry state.** It never calls `registerTelemetry` and never registers a global tracer provider. The handler passes its AI SDK integration per call (`telemetry.integrations`). It *reads* an app's global provider when one exists.
5. **Dependency direction:** `telemetry → chat, core`; `testing → core` (+ `chat`, `telemetry` as optional peers). `chat` never imports `telemetry`: it defines a small structural `ChatObservability` interface that `telemetry` implements. Only `packages/telemetry` may import `@opentelemetry/*` and `@ai-sdk/otel` (Biome `noRestrictedImports`).
6. **Nothing lands in `core`'s main entry.** Its size budget (visuals ≤ 10.45 KB, whole ≤ 18.5 KB **[R3]**) must not move. `core/redact` is a separate entry and chunk.
7. **English stays the built-in default.** Other locales are separate entries, so they tree-shake.
8. **Attribute names live in one file** (`packages/telemetry/src/semconv.ts`). The GenAI conventions are still in Development status.
9. **Redaction is on by default and runs last.** Every sink (events to listeners excepted, see §8) passes data through the page's redactor after any user processor, so nothing a processor adds escapes it.

---

## 4. Capability: `repo-tooling`

### 4.1 Knip

`knip.json` (root). Adjust entries until `pnpm knip` is clean; do not silence real findings.

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "ignoreExportsUsedInFile": true,
  "ignore": [
    "apps/docs/components/opendesigns/**",
    "apps/docs/components/ui/**",
    "apps/docs/public/**",
    "docs/media/**",
    "**/dist/**"
  ],
  "ignoreDependencies": ["@webmcp-agents/devtools"],
  "workspaces": {
    ".": {
      "entry": ["scripts/*.mjs", "capture/*.{ts,mjs}"],
      "project": ["scripts/**", "capture/**"]
    },
    "packages/*": {
      "entry": ["src/index.ts", "src/*/index.ts", "src/**/worker.ts", "scripts/*.mjs"],
      "project": ["src/**/*.{ts,tsx}"]
    },
    "packages/chat": {
      "entry": ["src/index.ts", "src/agent.ts", "src/server/index.ts", "src/vite/index.ts", "src/locales/*.ts"],
      "project": ["src/**/*.{ts,tsx}"]
    },
    "examples/*": {
      "entry": ["src/main.tsx", "api/*.ts", "e2e/*.ts", "app/**/{page,layout,route}.{ts,tsx}"],
      "project": ["**/*.{ts,tsx}"]
    },
    "docs/_examples": {
      "entry": ["**/*.{ts,tsx}"],
      "project": ["**/*.{ts,tsx}"]
    },
    "registry": { "entry": ["default/**/*.tsx", "test/*.ts"] }
  }
}
```

### 4.2 konsistent

Verified config surface (from the project's README): top-level `version`, `conventions[]`, `kebabToPascalMap`,
`kebabToCamelMap`; a convention has `name?`, `paths` (with `{placeholders}`), `severity?`, and `must` with
`haveType`, `haveFiles`, `exportValues`, `exportTypes`. **Read its `docs/README.md` for further rule types before
adding any not listed here**, and run `konsistent validate`.

`konsistent.json` (root):

```json
{
  "version": "v1",
  "conventions": [
    {
      "name": "published-package-shape",
      "paths": "packages/{pkg}",
      "must": {
        "haveType": "directory",
        "haveFiles": ["package.json", "README.md", "tsconfig.json", "tsdown.config.ts", "vitest.config.ts", "src/index.ts"]
      }
    },
    {
      "name": "package-has-reference-docs",
      "paths": "packages/{pkg}",
      "severity": "warning",
      "must": { "haveFiles": ["../../docs/reference/${pkg}/README.md"] }
    },
    {
      "name": "example-agent-layer",
      "paths": "examples/{app}/src/webmcp-agents",
      "must": { "haveType": "directory", "haveFiles": ["tools/index.ts"] }
    },
    {
      "name": "example-agent-layer-nextjs",
      "paths": "examples/nextjs/webmcp-agents",
      "must": { "haveType": "directory", "haveFiles": ["agents.ts", "tools/index.ts"] }
    },
    {
      "name": "testing-matcher-exports-itself",
      "paths": "packages/testing/src/matchers/{matcher}.ts",
      "must": { "exportValues": ["${matcher.toCamelCase()}"] }
    },
    {
      "name": "chat-locale-exports-itself",
      "paths": "packages/chat/src/locales/{locale}.ts",
      "must": { "exportValues": ["${locale.toCamelCase()}"] }
    },
    {
      "name": "registry-block-file",
      "paths": "registry/default/{block}",
      "must": { "haveType": "directory", "haveFiles": ["${block}.tsx"] }
    }
  ],
  "kebabToCamelMap": { "otlp": "otlp" }
}
```

Notes: confirm `toCamelCase()` exists (the README shows `toFlatCase()` and `toPascalCase()`); if a relative
`haveFiles` path outside the matched directory is not allowed, move that rule into `apps/docs/scripts/check-docs.mjs`.

**[R3]** Three things the repo needs for these rules to pass as written:
- `example-agent-layer` no longer asks for `agents.ts`: the playground has tools, a chat endpoint
  (`examples/playground/api/chat.ts`) and no `agents.ts`, so no konsistent rule can require that file for every
  Vite example. It is required only in the Next.js example, whose folder is `examples/nextjs/webmcp-agents`, not
  under `src/`. (Knip still reports an `agents.ts` nothing imports.)
- `packages/vercel-api` has no `README.md`: add a short one (what it is, that it is private, a link to
  `docs/reference/vercel-api`).
- `packages/telemetry` and `packages/testing` need `docs/reference/telemetry/` and `docs/reference/testing/` (each
  with a README `slug` and a `meta.ts`) by the end of phase 6; until then that rule is a warning, as configured.

A `konsistent-config` skill is installed on this machine: the session that writes the config loads it first.

### 4.3 Wiring

```jsonc
// package.json (root) — scripts
{
  "knip": "knip",
  "konsistent": "konsistent",
  "check": "biome ci . && pnpm konsistent && pnpm knip && turbo run typecheck test build size && pnpm registry:typecheck && pnpm registry:test"
}
```

```yaml
# .github/workflows/ci.yml — add to the existing job
- run: pnpm konsistent --format github
- run: pnpm knip --reporter github-actions
```

Also in this phase: every `package.json` `repository.url` and `.changeset/config.json` `repo` still say
`mustafaskyer/web-agents`; change to `webmcp-agents/webmcp-agents`. Add `"homepage": "https://webmcp-agents.dev"`.

### Requirements

- **R-TOOL-1** `pnpm check` SHALL fail on an unused file, export or dependency, and on a broken structural convention.
  - *Scenario:* add `packages/chat/src/locales/fr.ts` that does not export `fr` → `pnpm konsistent` exits non-zero.
- **R-TOOL-2** CI SHALL run both tools and annotate the pull request.

---

## 5. Capability: `chat-customization`

Goal: every visual value and every visible string of `<AgentChat>` (and the registry blocks) can be changed from CSS
variables, a JS/JSON object, or by replacing a part. No fork, no `!important`.

### 5.1 Public API

```ts
// packages/chat/src/customize/types.ts
import type { ComponentType, CSSProperties, ReactNode } from "react";

/** Every element the chat renders. Also the value of its `data-wa-part` attribute. */
export type ChatPart =
  | "root" | "launcher" | "panel" | "header" | "title" | "close" | "newChat"
  | "adapterSwitcher" | "modelPicker" | "modelOption"
  | "messages" | "message" | "bubble" | "text" | "reasoning"
  | "toolCard" | "toolName" | "toolState" | "toolInput" | "toolOutput" | "toolPrompt"
  | "subagent" | "suggestions" | "suggestion"
  | "composer" | "input" | "send" | "stop"
  | "downloadCard" | "progress" | "error" | "empty"
  // [R3] rendered today (0.4.0) and missing from revision 2:
  | "resizer" | "status" | "working" | "restore" | "restoreConfirm" | "restoreCancel";

/** A serializable theme: every key maps to one `--wa-chat-*` variable. JSON from a CMS works as is. */
export interface ChatTheme {
  color?: Partial<Record<
    "bg" | "fg" | "muted" | "soft" | "line" | "accent" | "accentInk" | "danger" | "success"
    | "userBubble" | "userBubbleInk" | "assistantBubble" | "assistantBubbleInk"
    | "toolBg" | "toolLine" | "inputBg" | "inputLine" | "focusRing" | "overlay", string>>;
  font?: Partial<Record<"family" | "mono" | "size" | "sizeSmall" | "lineHeight" | "weight" | "weightStrong", string>>;
  radius?: Partial<Record<"panel" | "bubble" | "control" | "launcher" | "card", string>>;
  space?: Partial<Record<"gap" | "pad" | "padBubble" | "insetLeft" | "insetRight" | "insetBottom", string>>;
  size?: Partial<Record<"width" | "maxHeight" | "launcher" | "icon" | "inputMinHeight", string>>;
  shadow?: Partial<Record<"panel" | "launcher" | "card", string>>;
  motion?: Partial<Record<"ease" | "duration" | "durationSlow", string>>;
  z?: string;
}

/** One theme, or one per color scheme (applied with `prefers-color-scheme`, or forced by `colorScheme`). */
export type ChatThemeInput = ChatTheme | { light?: ChatTheme; dark?: ChatTheme };

/** A string, or a function of its values (for word order and plurals a template cannot express). */
export type Message<V = void> = V extends void ? string : string | ((values: V) => string);

/** Every user-visible string, aria-label and live-region text. No string exists outside this object. */
export interface ChatMessages {
  title: string;
  launcher: { open: string; close: string };
  header: { close: string; newChat: string };
  composer: { placeholder: string; send: string; stop: string; label: string };
  empty: { title: string; hint: string };
  adapter: { label: string; cloud: string; cloudNamed: Message<{ model: string }>; onDevice: string; unavailable: string };
  model: { pick: string; recommended: string; cached: string; size: Message<{ bytes: number; formatted: string }> };
  download: { title: string; start: string; cancel: string; downloading: Message<{ percent: number }>; loading: Message<{ percent: number }>; ready: string };
  tool: {
    running: Message<{ tool: string }>;
    awaitingConfirmation: Message<{ tool: string }>;
    done: Message<{ tool: string }>;
    failed: Message<{ tool: string }>;
    cancelled: Message<{ tool: string }>;
    input: string; output: string; showDetails: string; hideDetails: string;
  };
  subagent: { working: Message<{ agent: string }>; finished: Message<{ agent: string }> };
  reasoning: { thinking: string; show: string; hide: string };
  steps: Message<{ count: number }>;
  /** Keyed by error code (adapter + server). `unknown` is the fallback. [R3] `aborted` and `run_failed` are what `agent.invoke` reports today. */
  errors: Record<
    | "chat_disabled" | "rate_limited" | "daily_limit" | "bad_request" | "network" | "session" | "busy" | "max_steps"
    | "aborted" | "run_failed" | "unknown",
    string
  >;
  /** Screen-reader announcements. */
  live: { thinking: string; answered: string; toolStarted: Message<{ tool: string }>; waitingForYou: Message<{ tool: string }> };

  // ---- [R3] strings the 0.4.0 chat renders that revision 2 had no key for (English defaults are today's text) ----
  /** The message list: its label ("Conversation") and the indicator while a run is in flight ("The assistant is working"). */
  conversation: { label: string; working: string };
  /** The line under the header while the adapter gets ready ("Connecting to the assistant…", "Download the model to start."). */
  status: { connecting: string; needsDownload: string };
  /** The suggestions row: its label and the one built-in suggestion ("What can you do on this page?"). */
  suggestions: { label: string; fallback: string };
  /** The dock's resize handle ("Resize the assistant"). */
  resize: string;
  /** Chat restore (0.4.0): the per-message button, its tooltip, and the confirm step. */
  restore: {
    button: Message<{ message: string }>;      // "Restore to before: {message}"
    hint: string;                              // "Restore to before this message"
    confirm: string;                           // "Remove this turn and everything after"
    cancel: string;                            // "Cancel"
  };
  // and, inside the groups above:
  //   tool.waiting ("Waiting for you"), tool.confirmOnPage ("Confirm on the page to continue.")
  //   download.starting ("Starting the model on this device…"), download.firstStart ("The first start can take a few minutes."),
  //   download.failed ("The download didn't finish"), download.offer ("Run the assistant on this device"),
  //   download.label / download.loadingLabel ("Model download" / "Model loading")
  //   model.label ("Model"), model.onDevice ("On this device")
}

/** A partial override at any depth. Plain JSON is valid: `{name}` placeholders are interpolated. */
export type ChatMessagesInput = DeepPartial<ChatMessages>;

/** Props every replaceable part receives. Spread `partProps` on your root element to keep hooks and a11y. */
export interface PartProps<P = {}> {
  partProps: { "data-wa-part": ChatPart; className?: string; style?: CSSProperties };
  messages: ChatMessages;
  t: Translate;
  children?: ReactNode;
}
export interface ChatComponents {
  Launcher: ComponentType<PartProps & { open: boolean; toggle(): void }>;
  Header: ComponentType<PartProps & { close(): void; reset(): void }>;
  Message: ComponentType<PartProps & { message: AgentMessage }>;
  Text: ComponentType<PartProps & { text: string; streaming: boolean }>;
  ToolCard: ComponentType<PartProps & { call: WebAgentStep }>;
  Reasoning: ComponentType<PartProps & { text: string }>;
  Suggestions: ComponentType<PartProps & { items: readonly string[]; pick(text: string): void }>;
  Composer: ComponentType<PartProps & { value: string; setValue(v: string): void; send(): void; stop(): void; busy: boolean }>;
  DownloadCard: ComponentType<PartProps & { status: AdapterStatus; start(): void; cancel(): void }>;
  ModelPicker: ComponentType<PartProps & { models: readonly ModelChoice[]; select(id: string): void }>;
  Empty: ComponentType<PartProps>;
  Error: ComponentType<PartProps & { code: keyof ChatMessages["errors"]; retry?(): void }>;
  Icon: ComponentType<{ name: IconName; size?: number }>;
  /** [R3] The restore control of one user message (0.4.0): idle, or asking to confirm. */
  Restore: ComponentType<PartProps & { message: AgentMessage; confirming: boolean; ask(): void; confirm(): void; cancel(): void }>;
}

export interface ChatCustomization {
  theme?: ChatThemeInput;
  /**
   * Force a scheme. Default "auto".
   * [R3] "auto" is today's behavior and must not change (`chat.css` lines 32 to 46): `data-theme="dark"` on the
   * chat or on any ancestor forces dark; `data-theme="light"` on the chat's own root forces light (on an ancestor
   * it does not, the OS still decides); otherwise the OS (`prefers-color-scheme`). "light" / "dark" set
   * `data-theme` on the chat's own root, which is why they always win.
   */
  colorScheme?: "auto" | "light" | "dark";
  messages?: ChatMessagesInput;
  /** BCP 47. Drives Intl formatting and plural rules. Default: `<html lang>`, else "en". */
  locale?: string;
  /** Default: from `locale` (ar, he, fa, ur → "rtl"), else `<html dir>`. */
  dir?: "ltr" | "rtl";
  classNames?: Partial<Record<ChatPart, string>>;
  styles?: Partial<Record<ChatPart, CSSProperties>>;
  components?: Partial<ChatComponents>;
  /** Ship no CSS at all (do not import chat.css): only `data-wa-part` hooks and your classes. Default false. */
  unstyled?: boolean;
}
// AgentChatProps extends ChatCustomization. useAgentChat() takes { messages, locale } too (for error text).
```

Helpers exported from `@webmcp-agents/chat`:

```ts
export const en: ChatMessages;                                    // the default catalog
export function defineChatMessages(m: ChatMessagesInput): ChatMessagesInput;   // typed identity, for autocomplete
export function defineChatTheme(t: ChatThemeInput): ChatThemeInput;
export function themeToCssVars(t: ChatTheme): Record<`--wa-chat-${string}`, string>;   // for SSR / no-React pages
export function createTranslator(messages: ChatMessagesInput, locale?: string): Translate;
// locales, one entry each: "@webmcp-agents/chat/locales/ar", ".../locales/es"
```

### 5.2 Three levels of customization, with code

**Level 1: CSS variables only.**

```css
/* app.css */
:root {
  --wa-chat-color-accent: oklch(0.62 0.19 255);
  --wa-chat-color-user-bubble: var(--wa-chat-color-accent);
  --wa-chat-radius-panel: 20px;
  --wa-chat-radius-bubble: 14px;
  --wa-chat-font-family: "Inter", system-ui, sans-serif;
  --wa-chat-size-width: 420px;
}
[data-wa-part="toolCard"][data-state="awaiting-confirmation"] { border-style: dashed; }
[data-wa-part="message"][data-role="user"] [data-wa-part="bubble"] { font-weight: 500; }
```

**Level 2: a JS object or plain JSON.**

```tsx
import { AgentChat, defineChatMessages, defineChatTheme } from "@webmcp-agents/chat";
import "@webmcp-agents/chat/chat.css";

const theme = defineChatTheme({
  light: { color: { accent: "#0f62fe", bg: "#ffffff", fg: "#161616" }, radius: { panel: "16px" } },
  dark: { color: { accent: "#78a9ff", bg: "#161616", fg: "#f4f4f4" } },
});

const messages = defineChatMessages({
  title: "Field Store assistant",
  composer: { placeholder: "Ask about an order, or tell me what to add to your cart" },
  tool: {
    // a function where a template is not enough
    running: ({ tool }) => `Working on ${tool.replaceAll("_", " ")}…`,
    awaitingConfirmation: "Click the highlighted button to confirm {tool}",
  },
  steps: ({ count }) => (count === 1 ? "1 step" : `${count} steps`),
  errors: { rate_limited: "Too many messages. Give it a minute." },
});

export function Chat() {
  return (
    <AgentChat
      agent={storeAgent}
      theme={theme}
      messages={messages}
      classNames={{ panel: "shadow-2xl", send: "btn btn-primary" }}
      styles={{ launcher: { insetInlineEnd: 24 } }}
    />
  );
}
```

```ts
// the same, from a CMS or a JSON file: nothing but data
const res = await fetch("/chat-config.json");
const { theme, messages, locale } = (await res.json()) as ChatCustomization;
```

```json
{
  "locale": "ar",
  "theme": { "color": { "accent": "#0a7d5a" }, "font": { "family": "IBM Plex Sans Arabic, system-ui" } },
  "messages": {
    "title": "مساعد المتجر",
    "composer": { "placeholder": "اكتب رسالتك…", "send": "إرسال", "stop": "إيقاف" },
    "tool": { "running": "جارٍ تنفيذ {tool}…", "awaitingConfirmation": "اضغط الزر المظلَّل لتأكيد {tool}" },
    "steps": "{count, plural, zero {لا خطوات} one {خطوة واحدة} two {خطوتان} few {# خطوات} many {# خطوة} other {# خطوة}}",
    "errors": { "network": "تعذّر الوصول إلى المساعد. تحقق من اتصالك." }
  }
}
```

**Shipped locale + overrides.**

```tsx
import { ar } from "@webmcp-agents/chat/locales/ar";

<AgentChat locale="ar" messages={{ ...ar, title: "مساعد سكاي لاين" }} />   // dir="rtl" is inferred
```

**Level 3: replace a part.**

```tsx
import { AgentChat, type ChatComponents } from "@webmcp-agents/chat";

const ToolCard: ChatComponents["ToolCard"] = ({ partProps, call, t }) => (
  <div {...partProps} data-state={call.state} className={`my-tool ${partProps.className ?? ""}`}>
    <strong>{call.tool}</strong>
    <span>{t(`tool.${call.state === "awaiting-confirmation" ? "awaitingConfirmation" : call.state === "error" ? "failed" : call.state}`, { tool: call.tool })}</span>
  </div>
);

<AgentChat components={{ ToolCard, Icon: MyIcon }} unstyled />
```

**No React (or SSR without a flash).**

```ts
import { themeToCssVars } from "@webmcp-agents/chat";
Object.assign(document.documentElement.style, themeToCssVars({ color: { accent: "#e11d48" } }));
```

### 5.3 Implementation notes

*Interpolation* (`packages/chat/src/customize/translate.ts`), no dependency:

```ts
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

const PLURAL = /\{(\w+),\s*plural,\s*((?:\w+\s*\{[^{}]*\}\s*)+)\}/g;

export function createTranslator(input: ChatMessagesInput, locale = "en"): Translate {
  const catalog = deepMerge(en, input);
  const rules = new Intl.PluralRules(locale);
  const number = new Intl.NumberFormat(locale);
  return (key, values = {}) => {
    const entry = get(catalog, key) ?? get(en, key) ?? key;          // never render undefined
    if (typeof entry === "function") return entry(values);
    return entry
      .replace(PLURAL, (_m, name: string, body: string) => {
        const n = Number(values[name]);
        const forms = Object.fromEntries([...body.matchAll(/(\w+)\s*\{([^{}]*)\}/g)].map((f) => [f[1], f[2]]));
        const form = (n === 0 && forms.zero) || forms[rules.select(n)] || forms.other || "";
        return form.replaceAll("#", number.format(n));
      })
      .replace(/\{(\w+)\}/g, (_m, name: string) => String(values[name] ?? ""));
  };
}
```

*CSS rules:*
- Rename to grouped tokens (`--wa-chat-color-accent`, `--wa-chat-radius-panel`…). **Keep the 18 old names as fallbacks** **[R3]** so 0.4.0 overrides still work: `--wa-chat-color-accent: var(--wa-chat-accent, #2563eb);`

  | Old name (0.4.0) | New token it feeds |
  |---|---|
  | `--wa-chat-accent`, `-accent-ink`, `-bg`, `-fg`, `-muted`, `-soft`, `-line`, `-danger`, `-success` | `--wa-chat-color-<same>` (`accent-ink` → `color-accent-ink`) |
  | `--wa-chat-font` | `--wa-chat-font-family` |
  | `--wa-chat-radius` | `--wa-chat-radius-panel` (bubble, control and card derive from it unless set) |
  | `--wa-chat-shadow` | `--wa-chat-shadow-panel` |
  | `--wa-chat-width` | `--wa-chat-size-width` |
  | `--wa-chat-gap` | `--wa-chat-space-gap` |
  | `--wa-chat-ease` | `--wa-chat-motion-ease` |
  | `--wa-chat-z` | stays `--wa-chat-z` |
  | `--wa-chat-inset-left`, `-inset-right` | `--wa-chat-space-inset-left` / `-right`, applied as inline-start / inline-end: the dock side is logical too, so in RTL a "right" dock sits on the left and the page makes room on that same side |

  The dark rules keep their selectors (`.wa-chat:not([data-theme="light"])` under `prefers-color-scheme: dark`, and
  `[data-theme="dark"] .wa-chat`): 0.3.0 made an explicit dark `--wa-chat-accent` need the dark condition, and that
  still holds. `packages/chat/test/theme.browser.test.tsx` already covers it and must pass unchanged.
- Logical properties only (`inset-inline-end`, `padding-inline`, `margin-block`, `border-start-start-radius`). `--wa-chat-inset-left/right` map to `-inline-start/end`.
- No raw color, size, radius, shadow, duration or z-index left in `chat.css`: a test greps for them.
- Stays unlayered **[R3, reworded]**: an app's plain `button { color: inherit }` beats any `@layer` rule, so library CSS in a layer would lose to it (CLAUDE.md gotcha).
- `data-wa-part` on every element; state as data attributes (`data-state`, `data-role`, `data-open`, `data-busy`).

*Server text:* the browser renders by **code**, never by the server's English.

```ts
// packages/chat/src/adapter/cloud.ts — before: `error: MESSAGES.network`; after: a code the UI translates
yield { type: "error", code: "network", error: en.errors.network };   // `error` kept for non-UI callers (agent.invoke)
```

**[R3]** Today `AgentStreamPart`'s error `code` is `"chat_disabled" | "rate_limited" | "bad_request" | "network"`, and
five failures carry English with no code or a borrowed one. Widen the union to `keyof ChatMessages["errors"]`
(additive) and give each its own code:

| Where (`adapter/cloud.ts` `failure`, `session/run-agent.ts`) | Today | Code |
|---|---|---|
| 401 `session_required` | text only | `session` |
| 503 with `reason: "daily_budget"`; 429 with `retry-after` over an hour | `rate_limited` + its own text | `daily_limit` |
| 503 that is not `chat_disabled` | text only | `busy` |
| any other status | "Something went wrong. Try again." | `unknown` |
| run aborted / run failed (`agent.invoke`, `useWebAgent`) | text only | `aborted` / `run_failed` |
| step limit reached | nothing is shown to the person today (a sub-agent's limit is reported to the model only) | `max_steps`: the one **new** visible message of this change |

A 0.4.0 server sends no new code: the adapter derives them from status and body as it does now, so an old server
with a new page still shows translated text. Server-only codes (`forbidden`, `method_not_allowed`, `server_error`,
`forbidden_origin`, `unavailable`) reach the person as `unknown` or `busy`; they are not catalog keys.

```ts
// createChatHandler: text the *model* or a non-UI client reads can be localized too
createChatHandler({
  messages: { toolBudget: "…", notOnPage: ({ tool }) => `…${tool}…`, serverError: "…" },
});
```

*Registry blocks* (`registry/default/**`): accept the same `messages`, `locale`, `classNames`; import `createTranslator`
from `@webmcp-agents/chat`. Sync `examples/nextjs/components/web-agents/` (the registry test compares them).

### 5.4 Tests

```tsx
// packages/chat/test/no-hardcoded-strings.browser.test.tsx
import { en } from "../src";
import { leaves, sentinel } from "./helpers";

it("renders no text that is not in the catalog", async () => {
  // every leaf becomes "⟦path⟧"; any other letters on screen are a hard-coded string
  const screen = render(<AgentChat defaultOpen adapter={scriptedEverything()} messages={sentinel(en)} />);
  await screen.getByRole("log").element();
  for (const state of ALL_UI_STATES) {
    await state.enter(screen);
    const stray = visibleText(screen.container).replace(/⟦[\w.]+⟧/g, "").replace(MODEL_AND_USER_TEXT, "").trim();
    expect(stray, state.name).toBe("");
    for (const el of screen.container.querySelectorAll("[aria-label],[placeholder],[title]"))
      for (const attr of ["aria-label", "placeholder", "title"])
        if (el.hasAttribute(attr)) expect(el.getAttribute(attr)).toMatch(/^⟦[\w.]+⟧$/);
  }
});

it("has no raw values in chat.css", () => {
  const css = readFileSync("src/chat.css", "utf8").replace(/--wa-chat-[\w-]+:\s*[^;]+;/g, "");   // token defaults are allowed
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|oklch\(|\b\d+px\b(?!\s*\))/i);
  expect(css).not.toMatch(/\b(left|right)\s*:|margin-(left|right)|padding-(left|right)/);
});

it("mirrors in RTL", async () => {
  const screen = render(<AgentChat defaultOpen locale="ar" />);
  const panel = screen.container.querySelector('[data-wa-part="panel"]')!;
  expect(panel.closest("[dir]")!.getAttribute("dir")).toBe("rtl");
  expect(panel.getBoundingClientRect().left).toBeLessThan(innerWidth / 2);
});
```

**[R3]** The "has no raw values in chat.css" test reads a file, which a browser test cannot do: it goes in
`packages/chat/test/chat-css.test.ts` (Node project), unchanged otherwise. `ALL_UI_STATES` must include the 0.4.0
states revision 2 did not know: restore idle and confirming, the resize handle, connecting, needs-download,
downloading, loading, download failed, a parked tool card, a sub-agent card, and each error code.

### Requirements

- **R-CHAT-1** Every user-visible string, aria-label and announcement SHALL come from `ChatMessages`.
  - *Scenario:* render with a sentinel catalog → no other text appears in any UI state.
- **R-CHAT-2** `messages` SHALL accept partial plain JSON with `{name}` and `{n, plural, …}` placeholders, and functions.
- **R-CHAT-3** Every visual value SHALL be a documented `--wa-chat-*` variable; `theme` SHALL map 1:1 to them.
  - *Scenario:* `theme={{ color: { accent: "red" } }}` → `getComputedStyle(root).getPropertyValue("--wa-chat-color-accent")` is `red`.
- **R-CHAT-4** Every element SHALL carry `data-wa-part`, and accept a class and style through `classNames` / `styles`.
- **R-CHAT-5** Every part in `ChatComponents` SHALL be replaceable; `unstyled` SHALL render with no library CSS.
- **R-CHAT-6** `locale` SHALL drive `Intl` formatting and direction; the layout SHALL mirror in RTL.
- **R-CHAT-7** The 0.4.0 variable names (all 18), props, `data-theme` behavior and restore UI SHALL keep working **[R3]**.
  - *Scenario:* a page that sets only `--wa-chat-accent: red` → the launcher and send button are red, as in 0.4.0.

---

## 6. Capability: `agent-run-telemetry` (in `@webmcp-agents/chat`)

### 6.1 Ids on the wire

```ts
// packages/chat/src/server/validate.ts
const ID = /^[a-zA-Z0-9_.-]{1,64}$/;
export const chatRequestSchema = z.object({
  /* …existing fields… */
  trace: z
    .object({
      conversation: z.string().regex(ID),
      run: z.string().regex(ID),
      step: z.number().int().min(1).max(64),
      parent: z.string().regex(ID).optional(),     // the delegate_to_* call id, for a sub-agent's run
    })
    .optional(),
});
// plus the standard `traceparent` header: /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/, ignored when malformed
```

```ts
// packages/chat/src/adapter/cloud.ts — inside run(), building the POST
const body = JSON.stringify({
  messages: forServer(window(history)),
  tools: req.tools,
  page: typeof location === "undefined" ? undefined : { url: location.href },
  agent: req.agent?.id,
  trace: req.ref && { conversation: req.ref.conversation, run: req.ref.run, step, parent: req.ref.parent },
});
const post = () =>
  doFetch(api, {
    method: "POST",
    signal,
    body,
    headers: { ...headers(), ...(req.ref?.traceparent && { traceparent: stepTraceparent(req.ref, step) }) },
  });
```

Ids use `crypto.randomUUID()` (today's `newId` is unique per page only).

### 6.2 Run events

```ts
// packages/chat/src/session/run-events.ts
export interface RunRef { conversation: string; run: string; parent?: string; traceparent?: string }
export interface StepUsage { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cachedInputTokens?: number; totalTokens?: number }

export type AgentRunEvent =
  | { type: "run-start"; ref: RunRef; agent?: string; adapter: string; at: number }
  | { type: "step-start"; ref: RunRef; step: number; tools: number; at: number }
  | { type: "step-finish"; ref: RunRef; step: number; ms: number; firstTokenMs?: number; model?: string; usage?: StepUsage; toolCalls: number }
  | { type: "tool-start"; ref: RunRef; step: number; call: string; tool: string; at: number; input?: unknown }
  | { type: "tool-park"; ref: RunRef; call: string; tool: string; prompt: string; at: number }
  | { type: "tool-yield"; ref: RunRef; call: string; reason: string; at: number }
  | { type: "tool-finish"; ref: RunRef; call: string; tool: string; ms: number; waitedMs: number; state: "done" | "error" | "cancelled"; code?: string; output?: ToolOutput }
  | { type: "run-finish"; ref: RunRef; reason: "stop" | "max-steps" | "aborted" | "error"; ms: number; steps: number; error?: string; code?: string };

const listeners = new Set<(e: AgentRunEvent) => void>();
/** Subscribe to every run on the page (chat, useWebAgent, agent.invoke). Returns an unsubscribe function. */
export function onAgentRun(listener: (e: AgentRunEvent) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
/** @internal A throwing listener never breaks a run. */
export function emitRun(e: AgentRunEvent): void {
  for (const l of listeners) {
    try { l(e); } catch (err) { console.error("[web-agents/chat] agent run listener threw", err); }
  }
}
```

Usage with no telemetry package at all:

```ts
import { onAgentRun } from "@webmcp-agents/chat";

onAgentRun((e) => {
  if (e.type === "tool-finish" && e.state === "error") analytics.track("agent_tool_failed", { tool: e.tool, code: e.code });
  if (e.type === "run-finish") analytics.track("agent_run", { reason: e.reason, steps: e.steps, ms: Math.round(e.ms) });
});
```

Where they are emitted in `runAgent` (*shape of the edit*):

```ts
callTool: async (call) => {
  const started = performance.now();
  inFlight = { id: call.id, waited: 0, parkedAt: 0 };
  emitRun({ type: "tool-start", ref, step, call: call.id, tool: call.name, at: started, input: call.input });
  const output = sub ? await runDelegate(sub, call) : await callModelContextTool(call, { signal });
  emitRun({
    type: "tool-finish", ref, call: call.id, tool: call.name,
    ms: performance.now() - started, waitedMs: inFlight.waited,
    state: signal.aborted ? "cancelled" : output.isError ? "error" : "done",
    code: errorCodeOf(output), output,
  });
  /* …existing toolsSettled() + refresh()… */
  return output;
},
```

Tool calls run one at a time inside a run, so core's name-keyed `park` / `yield` / `resume` events are attributed to
`inFlight`. **Core is not changed.**

### 6.3 Usage back to the browser

```ts
// AgentStreamPart (additive)
| { type: "step-finish"; step: number; usage?: StepUsage; model?: string }
```

```ts
// packages/chat/src/server/handler.ts
const streamed = await createAgentUIStreamResponse({
  agent: loop,
  uiMessages: toUIMessages(messages as AgentMessage[]),
  abortSignal: req.signal,
  sendReasoning: true,
  // verify the exact part shape in ai@7 before relying on it
  messageMetadata: telemetry.usageToClient
    ? ({ part }) => (part.type === "finish" ? { usage: pickUsage(part.totalUsage), model: id } : undefined)
    : undefined,
  onError,
});
```

### 6.4 Handler option

```ts
export interface ChatTelemetryOptions {
  /** Record prompts and tool definitions. Default false. */
  recordInputs?: boolean;
  /** Record the model's text, reasoning and tool calls. Default false. */
  recordOutputs?: boolean;
  /** Groups traces in the backend. Default "web-agent", or `web-agent.<agent id>`. */
  functionId?: string | ((agent: WebAgent | undefined) => string);
  /** Extra attributes for this request (a user id from your session…). Never put secrets here. */
  metadata?: (req: Request, ctx: ChatRequestContext) => Record<string, string | number | boolean> | Promise<Record<string, string | number | boolean>>;
  /** Send per-step token usage to the browser. Default true. */
  usageToClient?: boolean;
  /** A refused or failed request (guard, session, validation, budget, model error). Never receives content. */
  onRefused?: (info: { status: number; error: string; reason?: string; trace?: ChatRequest["trace"] }, req: Request) => void;
}
export interface ChatRequestContext { agent?: WebAgent; session?: string; trace?: ChatRequest["trace"] }
// ChatHandlerOptions.telemetry?: boolean | ChatTelemetryOptions   (default: {} → ids on, content off)
// prepareAgent / beforeModel contexts gain `trace` and `session`

/**
 * What an observability layer gives the handler. Structural, so `chat` never imports `@webmcp-agents/telemetry`
 * (which implements it, §7) and anyone can write their own.
 */
export interface ChatObservability {
  /** Per-call AI SDK telemetry: integrations bound to this layer's tracer, recording flags, function id. */
  telemetry(ctx: ChatRequestContext): Partial<NonNullable<WebAgentSettings["telemetry"]>>;
  /** Run the request inside the trace context of its `traceparent`, if any. */
  withContext<T>(req: Request, run: () => Promise<T>): Promise<T>;
  /** Called with every refusal; the layer counts or logs it. */
  refused?(info: { status: number; error: string; reason?: string }, req: Request): void;
  /** Resolve once buffered spans are sent. The handler hands it to `waitUntil` when the host has one. */
  flush(): Promise<void>;
}
// ChatHandlerOptions.observability?: ChatObservability
```

```ts
// packages/chat/src/server/telemetry.ts
export async function telemetrySettings(opts: ChatTelemetryOptions, req: Request, ctx: ChatRequestContext) {
  const extra = (await opts.metadata?.(req, ctx)) ?? {};
  const runtimeContext = {
    "webmcp.conversation.id": ctx.trace?.conversation,
    "webmcp.run.id": ctx.trace?.run,
    "webmcp.step": ctx.trace?.step,
    "webmcp.parent.call.id": ctx.trace?.parent,
    "webmcp.agent.id": ctx.agent?.id,
    "webmcp.session.id": ctx.session,
    ...extra,
  };
  return {
    runtimeContext,
    telemetry: {
      functionId: typeof opts.functionId === "function" ? opts.functionId(ctx.agent) : (opts.functionId ?? (ctx.agent ? `web-agent.${ctx.agent.id}` : "web-agent")),
      recordInputs: opts.recordInputs ?? false,
      recordOutputs: opts.recordOutputs ?? false,
      includeRuntimeContext: Object.fromEntries(Object.keys(runtimeContext).map((k) => [k, true])),
    },
  };
}
```

App code:

```ts
export const POST = createChatHandler({
  agents: [storeAgent],
  telemetry: {
    metadata: async (req) => ({ "user.id": (await getSession(req))?.userId ?? "anonymous", "app.release": process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }),
    onRefused: ({ status, error, reason }) => console.warn(JSON.stringify({ at: "chat", status, error, reason })),
  },
});
```

### Requirements

- **R-RUN-1** Every step request of a run SHALL carry the same `conversation` and `run` id and its own `step`.
- **R-RUN-2** `onAgentRun` SHALL deliver the events of §6.2 in order for cloud and on-device runs, sub-agents included (`ref.parent`).
  - *Scenario:* a run with one parked tool → `tool-park` precedes `tool-finish`, and `waitedMs > 0`.
- **R-RUN-3** With an AI SDK telemetry integration registered and no options, the step's trace SHALL carry the ids and SHALL NOT carry prompt, tool input or tool output content.
- **R-RUN-4** A server or page from 0.4.0 or earlier SHALL interoperate (unknown `trace` field is stripped; absent `trace` is fine) **[R3]**.
  Checked: `chatRequestSchema` is a plain `z.object` (not strict), so an old server drops `trace` without a 400.
  - *Scenario:* a new page posts `trace` to a 0.4.0 handler → 200, same stream as before.
  - *Scenario:* a 0.4.0 page posts no `trace` to a new handler → 200; spans carry no conversation id and nothing throws.
  - *Scenario:* a malformed `traceparent` header → ignored, the request is served and starts its own trace.

---

## 7. Capability: `telemetry-exporters` (new `@webmcp-agents/telemetry`)

Entries: `.` (browser), `./server`, `./react`.

### 7.1 Design rules

1. **One exporter shape.** An OTLP target is `endpoint` (base URL, `/v1/traces` appended) or per-signal `endpoints`
   (used exactly as given), a `protocol` (`http/json` default, `http/protobuf`, `grpc`) and `headers`. Protocol
   packages other than `http/json` are separate installs (optional peers).
2. **Standard instances pass straight through.** Any OpenTelemetry `SpanExporter`, `SpanProcessor` or `TracerProvider`
   is accepted as is. This is the extension point: a vendor that ships one works with no code here.
3. **Env-only setup works.** The standard `OTEL_EXPORTER_OTLP_*`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` and
   sampler variables are read; switching backend is an env change.
4. **An existing OpenTelemetry setup wins.** When the app registered a global tracer provider, the library uses it
   instead of creating its own.
5. **Familiar option names:** `serviceName`, `sampling` (`always` / `never` / `ratio` / `custom`), `exporters`,
   `spanProcessors`, `spanFilter`, `metadataMapping`, `resourceAttributes`, `batchSize`, `flush()` for serverless.
6. **Redaction is in the pipeline by default, after user processors** (§8).
7. **Fan-out belongs in an OpenTelemetry Collector**, not in the function: one target, the Collector routes to each backend.
8. **No named providers in code.** A named backend is a recipe (an env block or one constructor from the vendor's own
   package). A provider union would be a type this repo has to keep current.

### 7.2 Resolution order (one rule, both sides)

Where spans go, first match wins:

1. `tracerProvider` passed in → use it.
2. `exporters` / `spanProcessors` passed in → build a private provider from them.
3. A **global tracer provider** the app registered (Sentry, `@vercel/otel`, Datadog, the OTel Node or Web SDK, Langfuse's `NodeSDK` setup) → use it. This is what makes "any vendor that follows the standard" work with no config here.
4. Standard env (`OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) → build a private provider with one OTLP exporter.
5. Nothing → off, one `console.info` in development.

Env variables honoured (all standard, none invented except the switch):

| Variable | Meaning |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | base URL; `/v1/traces` is appended |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | used exactly as given, wins over the base |
| `OTEL_EXPORTER_OTLP_HEADERS` | `k=v,k2=v2` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/json` (default), `http/protobuf`, `grpc` |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | resource |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | `always_on`, `always_off`, `traceidratio` |
| `OTEL_SDK_DISABLED` | `true` turns everything off on the server; the relay then drops what browsers send (R-EXP-7) |
| `WEB_AGENTS_OTEL_ENABLED` | `false` turns only this library's telemetry off |

### 7.3 Server API

```ts
// @webmcp-agents/telemetry/server
import type { SpanExporter, SpanProcessor } from "@opentelemetry/sdk-trace-base";   // types only
import type { TracerProvider } from "@opentelemetry/api";

/** An OTLP destination. Missing fields fall back to the OTEL_* env vars. */
export interface OtlpTarget {
  /** Base collector URL: `/v1/traces` is appended. Give this or `endpoints`, never both (a type error; at runtime the target is disabled with an error). */
  endpoint?: string;
  /** Exact per-signal URL, used as given (query strings, tenant paths). */
  endpoints?: { traces: string };
  /** Default "http/json" (no dependency, works on edge). The others load their OTel exporter package as an optional peer. */
  protocol?: "http/json" | "http/protobuf" | "grpc";
  headers?: Record<string, string>;
  /** Export timeout, ms. Default 30000. */
  timeout?: number;
}

export type Sampling =
  | { type: "always" }
  | { type: "never" }
  | { type: "ratio"; probability: number }
  | { type: "custom"; sampler: (ctx: { agent?: string; conversation?: string; request?: Request }) => boolean };

export interface ObservabilityConfig {
  /** Default: OTEL_SERVICE_NAME, else "web-agents". */
  serviceName?: string;
  /** Merged over OTEL_RESOURCE_ATTRIBUTES. */
  resourceAttributes?: Record<string, string>;
  /** Where spans go: OTLP targets and/or any OpenTelemetry SpanExporter instance. See §7.2 for the default. */
  exporters?: readonly (OtlpTarget | SpanExporter)[];
  /** Any OpenTelemetry SpanProcessor (a vendor's own, or yours). They run before redaction. */
  spanProcessors?: readonly SpanProcessor[];
  /** A provider to use as is, or "global" to require the app's, or "own" to never use the global one. */
  tracerProvider?: TracerProvider | "global" | "own";
  /** Default { type: "always" } (or OTEL_TRACES_SAMPLER). */
  sampling?: Sampling;
  /** Attribute style of the model spans: "genai" (gen_ai.*, default), "legacy" (ai.*), or both, each to its own tracer. */
  conventions?: "genai" | "legacy" | "both";
  /** Record prompts / model output on model spans. Default false. */
  recordInputs?: boolean;
  recordOutputs?: boolean;
  /** Redaction of everything exported (§8). Default: on, with the default rules. `false` only for local debugging. */
  redact?: false | RedactOptions | Redactor;
  /** Copy one of our attributes to the name a backend groups by, e.g. { "webmcp.conversation.id": "session.id" }. */
  metadataMapping?: Record<string, string>;
  /** Keep (true) or drop (false) a span. Runs after processors and redaction. */
  spanFilter?: (span: ReadableSpanLike) => boolean;
  /** Spans per batch. Default 512. */
  batchSize?: number;
  /** Print each exported span to the console. Default: WEB_AGENTS_OTEL_DEBUG === "true". */
  debug?: boolean;
  /** Default `process.env`. */
  env?: Record<string, string | undefined>;
}

/** Implements chat's `ChatObservability`, plus the relay and shutdown. Lazy: nothing loads until the first request. */
export interface Observability extends ChatObservability {
  readonly enabled: boolean;
  /** `POST` handler that accepts the browser's spans and forwards them (§7.6). */
  relay(options?: TelemetryRelayOptions): (req: Request) => Promise<Response>;
  shutdown(): Promise<void>;
}
export function defineObservability(config?: ObservabilityConfig): Observability;
/** An OTLP target from explicit values and/or env. `otlp()` alone means "whatever OTEL_* says". */
export function otlp(target?: OtlpTarget): OtlpTarget;
```

**The one line.** Everything else is env:

```ts
// app/api/chat/route.ts
import { createChatHandler } from "@webmcp-agents/chat/server";
import { defineObservability } from "@webmcp-agents/telemetry/server";

export const POST = createChatHandler({ agents, observability: defineObservability() });
```

```bash
# .env — LangSmith (endpoint and header names from LangSmith's "Trace with OpenTelemetry" page)
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.smith.langchain.com/otel
OTEL_EXPORTER_OTLP_HEADERS=x-api-key=lsv2_…,Langsmith-Project=field-store
```

Swap the two env lines and the same code sends to any OTLP backend. No code change, no new type.

**Explicit configuration.**

```ts
export const observability = defineObservability({
  serviceName: "field-store",
  sampling: { type: "ratio", probability: 0.2 },
  exporters: [
    otlp({ endpoint: "https://otel.example.com", protocol: "http/protobuf", headers: { "x-api-key": process.env.OTEL_KEY! } }),
    otlp({ endpoints: { traces: "https://traces.example.com/api/ingest/?tenant=acme" } }),
  ],
  metadataMapping: { "webmcp.conversation.id": "session.id", "user.id": "enduser.id" },
  resourceAttributes: { "deployment.environment": process.env.VERCEL_ENV ?? "development" },
});
```

**A vendor's own OpenTelemetry exporter or processor: pass the instance.** This is the whole extension story.

```ts
import { LangWatchExporter } from "langwatch";                    // LangWatch's guide passes this as the trace exporter
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { BraintrustSpanProcessor } from "braintrust";
import { PostHogTraceExporter } from "@posthog/ai/otel";

defineObservability({ exporters: [new LangWatchExporter()], conventions: "legacy" });
defineObservability({ spanProcessors: [new LangfuseSpanProcessor()] });
defineObservability({ spanProcessors: [new BraintrustSpanProcessor({ parent: "project_name:field-store" })], conventions: "legacy" });
defineObservability({ exporters: [new PostHogTraceExporter({ apiKey: process.env.POSTHOG_API_KEY! })], conventions: "legacy" });
```

**The app already has OpenTelemetry (Sentry, `@vercel/otel`, Datadog, a `NodeSDK`).** Nothing to pass:

```ts
// instrumentation.ts — the app's own setup, unchanged
import * as Sentry from "@sentry/node";
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 1 });

// route — the global provider is detected (rule 3 of §7.2)
createChatHandler({ agents, observability: defineObservability() });
```

**Several backends:** prefer one OTLP target pointed at an OpenTelemetry Collector that fans out (the approach
LangSmith's docs describe), over several exporters in the function. Document a ready `otel-collector.yaml`.

### 7.4 How the handler uses it (no global state)

```ts
// packages/telemetry/src/server/observability.ts (shape)
export function defineObservability(config: ObservabilityConfig = {}): Observability {
  const env = config.env ?? process.env;
  let ready: Promise<Runtime | null> | undefined;                       // built on first use, never at import
  const runtime = () => (ready ??= build(config, env).catch((err) => {
    console.error("[web-agents/telemetry] disabled, the chat is unaffected:", redactor.error(err));
    return null;
  }));

  return {
    get enabled() { return resolves(config, env) !== "off"; },
    telemetry(ctx) {
      const rt = current();                                             // sync view of the built runtime, else undefined
      return {
        isEnabled: !!rt && rt.sampled(ctx),
        recordInputs: config.recordInputs ?? false,
        recordOutputs: config.recordOutputs ?? false,
        // per call, bound to our tracer: the app's own registerTelemetry() integrations are never replaced globally
        integrations: rt?.integrations,
      };
    },
    async withContext(req, run) {
      const rt = await runtime();
      return rt ? rt.withRemoteParent(req.headers.get("traceparent"), run) : run();
    },
    flush: async () => (await runtime())?.provider.forceFlush(),
    shutdown: async () => (await runtime())?.provider.shutdown(),
    relay: (options) => createRelay(runtime, options),
  };
}

async function build(config: ObservabilityConfig, env: Env): Promise<Runtime | null> {
  const mode = resolves(config, env);                                   // §7.2
  if (mode === "off") return null;
  const [otel, api] = await Promise.all([import("@ai-sdk/otel"), import("@opentelemetry/api")]);   // optional peers
  const provider = mode === "global" ? api.trace.getTracerProvider() : await privateProvider(config, env);
  const tracer = provider.getTracer("@webmcp-agents/telemetry", VERSION);
  const style = config.conventions ?? "genai";
  return {
    provider,
    integrations: [
      ...(style !== "legacy" ? [new otel.OpenTelemetry({ tracer })] : []),
      ...(style !== "genai" ? [new otel.LegacyOpenTelemetry({ tracer })] : []),
    ],
    /* sampled(), withRemoteParent() */
  };
}
```

`privateProvider` wraps every exporter and processor in one pipeline: user `spanProcessors` → `metadataMapping` →
**redaction** → `spanFilter` → batch → exporters. With a global provider we cannot own the pipeline, so redaction is
applied to the attributes *we* set before the span is created, and the docs say the app's own processors see the rest.

**[R3]** Two lines of the sketch above cannot be written as shown, and each has a failure path to cover:
- `provider.forceFlush()` / `provider.shutdown()`: the API's `TracerProvider` type has neither. A private provider
  has both; a global one may sit behind the API's proxy. Call them only when present (unwrap the proxy's delegate
  first), and never `shutdown()` a provider the app owns. `flush()` resolves either way and never rejects.
- "A global provider the app registered": `trace.getTracerProvider()` always returns a proxy, registered or not.
  Mode `global` is chosen only when the proxy's delegate is a real provider (not the no-op one). With
  `tracerProvider: "global"` and none registered: off, one error naming the fix, the chat unaffected (R-EXP-6).

Built-in exporters: `http/json` is hand-rolled (`fetch`, no dependency, runs on edge and in the browser). The others
load `@opentelemetry/exporter-trace-otlp-proto` / `-grpc` with a literal `import()`; a missing package is one clear
error naming the package to install.

### 7.5 Browser API

```ts
// @webmcp-agents/telemetry
export interface ObserveAgentsOptions {
  /** Default: the page's global tracer provider when one is registered (OTel Web SDK, Sentry, Datadog RUM), else the relay at "/api/telemetry". */
  exporters?: readonly (OtlpTarget | BrowserSpanExporter)[];
  tracerProvider?: TracerProvider | "global" | "own";
  serviceName?: string;                       // default location.host
  sampling?: Sampling;
  recordInputs?: boolean;                     // tool inputs on execute_tool spans. Default false
  recordOutputs?: boolean;                    // tool results. Default false
  redact?: false | RedactOptions | Redactor;  // default: the page's redactor (§8)
  /** Consent gate, read at each run-start. Default () => true. */
  enabled?: () => boolean;
  spanFilter?: (span: SpanRecord) => boolean;
  metadataMapping?: Record<string, string>;
  batchMs?: number;                           // default 2000
  batchSize?: number;                         // default 64
}
export function observeAgents(options?: ObserveAgentsOptions): () => void;
export interface BrowserSpanExporter { export(spans: readonly SpanRecord[]): void | Promise<void>; flush?(): Promise<void> }
export function consoleExporter(): BrowserSpanExporter;
```

```tsx
// one line in React
import { ObserveAgents } from "@webmcp-agents/telemetry/react";
<WebAgentsProvider><ObserveAgents enabled={() => consent.analytics} /><App /></WebAgentsProvider>
```

```ts
// no framework
import { observeAgents } from "@webmcp-agents/telemetry";
observeAgents();
```

```ts
// the page already runs the OpenTelemetry Web SDK: its provider is detected, spans join its traces
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
new WebTracerProvider({ spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: "/otel/v1/traces" }))] }).register();
observeAgents();          // or observeAgents({ tracerProvider: myProvider })
```

Detection must not import `@opentelemetry/api` into the default bundle: read the API's global registry
(`globalThis[Symbol.for("opentelemetry.js.api.1")]?.trace`, **verify the key**) and load the OTel bridge chunk only
when it is there. Default bundle (relay path) ≤ 3 KB min+gz.

**[R3]** Span shapes (revision 2 pointed at a plan 16 that is not in the repo, so they are written out here; every
name below is a constant in `src/semconv.ts`, and GenAI names follow the OpenTelemetry GenAI conventions as they
stand the day phase 5 starts):

```
invoke_agent <agent id | "web-agent">          browser · one per run (run-start → run-finish)
│   gen_ai.operation.name=invoke_agent · gen_ai.agent.id · webmcp.conversation.id · webmcp.run.id
│   webmcp.adapter · webmcp.run.reason (stop | max-steps | aborted | error) · webmcp.run.steps
│   webmcp.page (redacted URL) · status ERROR + error.type on reason "error"
├── chat <model>                               server · one per step, from the AI SDK integration (§7.4)
│       parent = this run's span, through the step's `traceparent`
│       gen_ai.request.model · gen_ai.usage.input_tokens / output_tokens · webmcp.step
│       the same webmcp.conversation.id / run.id / agent.id / session.id (runtime context, §6.4)
├── execute_tool <tool>                        browser · one per tool call (tool-start → tool-finish)
│       gen_ai.operation.name=execute_tool · gen_ai.tool.name · gen_ai.tool.call.id · webmcp.step
│       webmcp.tool.state (done | error | cancelled) · webmcp.tool.error.code · webmcp.tool.waited_ms
│       webmcp.tool.confirm (accepted | cancelled | timeout), only for a parked call
│       gen_ai.tool.call.arguments / .result only with recordInputs / recordOutputs, always redacted
│       events: webmcp.park { prompt } · webmcp.yield { reason } · webmcp.resume
└── invoke_agent <sub-agent id>                browser · a delegate_to_* call: child of its execute_tool span,
                                               webmcp.parent.call.id = that call's id, same trace
```

On-device runs have no server span: `chat` is then a browser span built from `step-start` / `step-finish`, with no
usage. A run whose page has no relay and no provider produces nothing and costs nothing.

### 7.6 Relay

```ts
// app/api/telemetry/route.ts
import { observability } from "@/lib/observability";
export const POST = observability.relay();
```

```ts
export interface TelemetryRelayOptions {
  /** Runs first; return a Response to refuse (rate limit, session check). */
  guard?: (req: Request) => Promise<Response | undefined> | Response | undefined;
  /** Default 256 KB. */
  maxBytes?: number;
  /** Resource attributes added on the server (release, region). */
  attributes?: (req: Request) => Record<string, string>;
}
```

The relay SHALL: refuse cross-site requests (the `isCrossSite` rule), cap the body, accept only OTLP JSON whose
instrumentation scope is `@webmcp-agents/telemetry`, **run the server's redactor over every attribute again** (the
browser is not trusted), re-emit the spans through the same pipeline as §7.4 (so they reach whatever the server
exports to, global provider included), answer `202` with no body, and never echo upstream errors. It ignores the
browser's sampled flag.

### 7.7 `vercel-api`

```ts
// examples/*/api/chat.ts — unchanged call; telemetry comes from env
export const { GET, POST, OPTIONS } = createVercelChatRoute({ app: "ecommerce", agents });
// examples/*/api/telemetry.ts
export const { POST } = createVercelTelemetryRoute({ app: "ecommerce" });      // relay behind the per-IP limiter
```

Inside: one `defineObservability()` per cold start, `waitUntil(observability.flush())` after the stream closes.

### 7.8 Recipes (docs pages, not code)

One page each under `docs/observability/backends/`. A recipe is an env block or one constructor, the `conventions`
value if not the default, and the `metadataMapping` that makes conversations group. **Each value is verified against
the vendor's docs when the page is written, with the source linked on the page.** Seeds found so far:

| Backend | Path | Seed (verify) | Source |
|---|---|---|---|
| Any OTLP collector (Grafana, Honeycomb, SigNoz, Dash0, Axiom, Jaeger) | env | `OTEL_EXPORTER_OTLP_ENDPOINT`, `…_HEADERS` | OTel spec |
| LangSmith | env | `https://api.smith.langchain.com/otel`; headers `x-api-key`, optional `Langsmith-Project`; session via `langsmith.trace.session_id`; metadata via `langsmith.metadata.{key}`; do not mix `Langsmith-Project` with the agent headers | LangSmith docs |
| LangWatch | exporter instance | `new LangWatchExporter()` from `langwatch`, `LANGWATCH_API_KEY`, `conventions: "legacy"`, thread grouping by its thread id key | AI SDK LangWatch guide |
| Langfuse | span processor | `new LangfuseSpanProcessor()` from `@langfuse/otel` | AI SDK Langfuse guide |
| Sentry | global provider | `Sentry.init(...)`; nothing else | AI SDK Sentry guide |
| PostHog | exporter instance | `PostHogTraceExporter` from `@posthog/ai/otel`, `conventions: "legacy"`, `posthog_distinct_id` | AI SDK PostHog guide |
| Braintrust | span processor | `BraintrustSpanProcessor` from `braintrust`, `conventions: "legacy"` | AI SDK Braintrust guide |
| IBM Instana | env (agentless or host agent) | see §7.8.1 | IBM Instana docs |
| Datadog | env or global provider | OTLP intake, or `dd-trace`'s provider | Datadog docs |
| Arize Phoenix / AX | span processor | `@arizeai/openinference-vercel`, `conventions: "legacy"` | AI SDK Arize guide |
| Laminar | env | `https://api.lmnr.ai/v1/traces`, `LMNR_PROJECT_API_KEY` | Laminar docs (verify) |
| New Relic | env | `https://otlp.nr-data.net:443/v1/traces`, license key header | New Relic docs (verify) |
| Traceloop | env | `https://api.traceloop.com/v1/traces` | Traceloop docs (verify) |
| W&B Weave | env | `https://trace.wandb.ai/otel/v1/traces`, base64 key header + `project_id`, `conventions: "legacy"` | AI SDK Weave guide |
| Vercel | global provider | `registerOTel()` from `@vercel/otel` | Vercel docs |
| Helicone | model provider | `createChatHandler({ model: helicone("…") })`; not telemetry | AI SDK Helicone guide |

A CI job keeps the pages honest: every code block is a compiled file in `docs/_examples/observability/`.

#### 7.8.1 IBM Instana

Supported through the standard path: no Instana code, type or package in this repo. Two modes, both env-only.

```bash
# Agentless: straight to the Instana backend's OTLP acceptor. COLOR is the tenant's region (blue, red, green, orange, coral…).
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-COLOR-saas.instana.io:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=x-instana-key=<agent key>,x-instana-host=<host id>
OTEL_SERVICE_NAME=field-store
```

```bash
# Host agent: the Instana agent's own OTLP receiver (4318 HTTP, 4317 gRPC); the agent holds the key.
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318          # in Kubernetes: http://instana-agent.instana-agent:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_SERVICE_NAME=field-store
```

```ts
// the same line as every other backend
createChatHandler({ agents, observability: defineObservability() });

// or explicit
defineObservability({
  exporters: [otlp({
    endpoint: `https://otlp-${process.env.INSTANA_REGION}-saas.instana.io:4318`,
    protocol: "http/protobuf",
    headers: { "x-instana-key": process.env.INSTANA_AGENT_KEY!, "x-instana-host": process.env.INSTANA_HOST_ID ?? "field-store" },
  })],
});
```

What the recipe page must cover, and what to verify on IBM's docs before publishing it:

- **Protocol.** The examples found use `http/protobuf` (and gRPC on 4317). Whether the acceptor takes OTLP `http/json`
  (this library's dependency-free default) is unconfirmed: the recipe sets `http/protobuf` and lists
  `@opentelemetry/exporter-trace-otlp-proto` as the install. On an edge runtime, where that package may not load, the
  documented route is a Collector or the host agent.
- **Identity.** Agentless ingestion needs the `x-instana-key` header and a way to tie data to an entity: the
  `x-instana-host` header, or a `host.id` / `faas.id` / `device.id` resource attribute. On serverless hosts set
  `resourceAttributes: { "faas.id": … }` (or `x-instana-host`) explicitly; a missing identity is the usual cause of
  accepted-but-invisible data. A wrong region host answers 403.
- **Endpoint forms.** `otlp-COLOR-saas.instana.io:4318` and the `otlp-http-…` / `otlp-grpc-…` hosts on 443 are both
  documented; self-hosted Instana uses its own base domain.
- **GenAI views.** Instana's GenAI observability is built on OpenLLMetry (Traceloop) instrumentation. Traces from this
  library will arrive as ordinary distributed traces either way; whether its GenAI dashboards light up from plain
  `gen_ai.*` attributes, or need OpenLLMetry's `traceloop.*` / legacy attribute names, must be checked against a real
  tenant. If they need the latter, the recipe documents a Collector `transform` processor (and tries
  `conventions: "legacy"`); **no Instana-specific mapping goes into the library.**
- **Browser spans** go through the relay like any backend; the agent key never reaches the page. Instana's own website
  monitoring (EUM) is separate and can run beside it.


### 7.9 Tests

```ts
import { describe, expect, it } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { defineObservability } from "@webmcp-agents/telemetry/server";

it("accepts any OpenTelemetry SpanExporter", async () => {
  const memory = new InMemorySpanExporter();
  const observability = defineObservability({ exporters: [memory], env: {} });
  const handler = createChatHandler({ model: mockModel([text("hi")]), observability });
  await readChatStream(await handler(chatRequest({ messages: [user("My card is 4242 4242 4242 4242")], trace: REF })));
  await observability.flush();

  const spans = memory.getFinishedSpans();
  expect(spans.every((s) => s.attributes["webmcp.conversation.id"] === REF.conversation)).toBe(true);
  expect(JSON.stringify(spans)).not.toContain("4242");                  // content off + redaction
});

it.each([
  [{}, "off"],
  [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example" }, "https://c.example/v1/traces"],
  [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://t.example/x?y=1" }, "https://t.example/x?y=1"],
  [{ OTEL_EXPORTER_OTLP_ENDPOINT: "https://c.example", OTEL_SDK_DISABLED: "true" }, "off"],
])("resolves env %j → %s", (env, expected) => expect(resolveTarget({}, env)).toBe(expected));

it("uses the app's global provider and registers nothing itself", async () => {
  const memory = new InMemorySpanExporter();
  const app = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memory)] });
  trace.setGlobalTracerProvider(app);
  const before = trace.getTracerProvider();
  await runOneStep(defineObservability({ env: {} }));
  expect(trace.getTracerProvider()).toBe(before);
  expect(memory.getFinishedSpans().length).toBeGreaterThan(0);
});

it("a broken exporter never breaks the chat", async () => {
  const observability = defineObservability({ exporters: [{ export: () => { throw new Error("boom"); }, shutdown: async () => {} } as never], env: {} });
  const res = await createChatHandler({ model: mockModel([text("ok")]), observability })(chatRequest({ messages: [user("hi")] }));
  expect(res.status).toBe(200);
});
```

Plus: the span-tree test (one turn, one trace, browser + server), relay refusals, `endpoint` + `endpoints` together is
rejected, missing optional peer names the package, `pagehide` flush (browser mode), and the size script.

### Requirements

- **R-EXP-1** With `observability: defineObservability()` and the standard `OTEL_EXPORTER_OTLP_*` env set, every model step SHALL be exported, with no other code.
- **R-EXP-2** Any OpenTelemetry `SpanExporter`, `SpanProcessor` or `TracerProvider` instance SHALL be accepted as is. Adding a backend SHALL require no change in this repo.
- **R-EXP-3** When the app registered a global tracer provider and nothing else is configured, spans SHALL go through it. The library SHALL NOT register or replace a global provider or a global AI SDK integration.
- **R-EXP-4** `observeAgents()` plus the relay SHALL add browser spans to the same trace; no backend credential SHALL reach the browser.
- **R-EXP-5** No prompt, tool input, tool output or typed value SHALL be exported unless recording is on; with recording on, redaction (§8) SHALL still apply.
- **R-EXP-6** A missing optional peer, bad env, failing exporter or unreachable backend SHALL log once and SHALL NOT affect a chat request.
- **R-EXP-7** `enabled()` returning false SHALL export nothing (consent). `OTEL_SDK_DISABLED=true` SHALL disable both sides.
  **[R3]** A browser cannot read server env, so "both sides" means: the server creates no span, and the relay
  answers `202` and drops what it is sent. To stop the browser from sending at all, use `enabled`.
  - *Scenario:* `OTEL_SDK_DISABLED=true`, browser posts spans to the relay → `202`, nothing is exported.

**[R3]** Failure scenarios each requirement above must also have in its spec (fail-first; one test each):
bad `OTEL_EXPORTER_OTLP_HEADERS` syntax → that header is skipped, logged once, export continues;
unknown `OTEL_EXPORTER_OTLP_PROTOCOL` → off with one error naming the three valid values;
`endpoint` and `endpoints` together → that target is disabled with an error, other targets still export;
`http/protobuf` without its package → one error naming `@opentelemetry/exporter-trace-otlp-proto`;
`@ai-sdk/otel` or `@opentelemetry/api` not installed → off, one error naming the package;
exporter throws, rejects, or never resolves → dropped after `timeout`, the chat response is unaffected;
`flush()` on a host without `waitUntil` → awaited after the stream closes, capped by `timeout`;
relay: wrong content type, oversize body, foreign scope name, cross-site origin, malformed JSON → 4xx with no detail.

---

## 8. Capability: `data-redaction`

One utility, one configuration per page and per server, applied at every place data leaves a tool call. Today the only
masking in the repo is `visuals.ts` replacing a password field's value with `"••••"` in the `fill` event.

### 8.1 API (`@webmcp-agents/core/redact`, its own entry and chunk; no dependency; ≤ 1.5 KB min+gz)

```ts
export type RedactionStyle =
  | "full"       // "[REDACTED]"
  | "partial"    // keeps the first and last characters: "4242…4242" → "42••••42"; short values are fully redacted
  | "indexed";   // a stable token per distinct value within one run: "[EMAIL_1]", "[CARD_1]"… so a trace stays readable

export interface PatternRule { pattern: RegExp; label: string; validate?: (match: string) => boolean; style?: RedactionStyle }

export interface RedactOptions {
  /**
   * Field names whose value is always redacted. Compared after lowercasing and dropping non-alphanumerics
   * ("api-key", "api_key", "Api Key" → "apikey"). A name matches when it equals an entry or ends with one
   * ("authToken" matches "token"; "tokenCount" does not). Pass a function to extend the defaults.
   *
   * [R3] Two ways to match, so that short entries cannot fire inside a longer word:
   *  1. by words: the key is split into words (camelCase, `_`, `-`, `.`, spaces) and matches when its last one or
   *     more words, joined, equal an entry. "authToken" → auth·token ✓ · "user_api_key" → "apikey" ✓ · "cardNumber" ✓
   *  2. by characters, only for entries of five letters or more: the normalized key ends with the entry.
   *     "accesstoken", "refreshtoken", "userpassword", "clientsecret" ✓ (written with no separator)
   * Entries of four letters or fewer (pin, pan, otp, cvv, cvc, ssn, jwt, iban) match by words only:
   * "timespan", "japan", "spin", "captcha_pin_count" ✗ · "card_pin", "userPin" ✓.
   */
  keys?: readonly string[] | ((defaults: readonly string[]) => readonly string[]);
  /** Names that are never redacted, checked first (e.g. "tokenCount", "keyboard"). */
  allowKeys?: readonly string[];
  /** Value detectors run on every string. `false` turns them all off. Defaults: email, card (Luhn-checked), jwt, bearer, secretKey (sk-…, ghp_…, AKIA…). `phone` and `iban` exist but are off by default (false positives). */
  patterns?: false | Partial<Record<"email" | "card" | "jwt" | "bearer" | "secretKey" | "phone" | "iban", boolean | PatternRule>> & Record<string, boolean | PatternRule>;
  /** Exact paths, with `*` for one segment: "input.passport", "output.*.address". */
  paths?: readonly string[];
  /** Query parameters kept in URLs; every other parameter value is redacted. Default: none kept. */
  allowQuery?: readonly string[];
  style?: RedactionStyle;          // default "full"
  token?: string;                  // default "[REDACTED]"
  maxDepth?: number;               // default 8; deeper values become "[Truncated]"
  maxStringLength?: number;        // default 8192; longer strings are cut, then scanned
  /** Last word on any value. Return `undefined` to keep the library's result. Must not throw (a throw redacts the value). */
  custom?: (value: unknown, ctx: { key?: string; path: string; kind: RedactKind; tool?: string }) => unknown;
}
export type RedactKind = "tool-input" | "tool-output" | "fill" | "prompt" | "completion" | "url" | "error" | "attribute" | "log";

export interface Redactor {
  /** A redacted deep copy. Never mutates, never throws; cycles become "[Circular]". */
  <T>(value: T, ctx?: { kind?: RedactKind; tool?: string; sensitive?: readonly string[] }): T;
  text(value: string): string;
  /** Origin + path kept; query values redacted (except `allowQuery`); credentials and hash dropped. */
  url(value: string): string;
  headers(value: Record<string, string>): Record<string, string>;
  /** A loggable message from anything thrown: message only, scanned. */
  error(value: unknown): string;
  /** A new redactor with these options merged over this one's. */
  extend(options: RedactOptions): Redactor;
  /** Fresh "indexed" numbering (one per run / trace). */
  scope(): Redactor;
}

export function createRedactor(options?: RedactOptions): Redactor;
export const DEFAULT_SENSITIVE_KEYS: readonly string[];   // password, passwd, secret, token, apikey, authorization, cookie, setcookie, session, jwt, ssn, cvv, cvc, cardnumber, pan, iban, passport, pin, otp, privatekey…
/** The page's (or process's) redactor: every library sink uses it unless given its own. */
export function getRedactor(): Redactor;
export function configureRedaction(options: RedactOptions | Redactor): void;
/** One value, no traversal: `mask("4242424242424242", "partial")`. */
export function mask(value: string, style?: RedactionStyle, token?: string): string;
/** A control whose value must never be shown: password type, `autocomplete` of current-password / new-password / one-time-code / cc-number / cc-csc / cc-exp…, or `[data-agent-sensitive]`. */
export function isSensitiveControl(el: Element): boolean;
```

### 8.2 Marking what is sensitive (three ways, they add up)

```ts
// 1. on the tool: parameter and result fields by name
export const fillTraveler = defineWebTool({
  name: "fill_traveler",
  description: "…",
  inputSchema: z.object({ fullName: z.string(), passport: z.string(), email: z.string().email() }),
  sensitive: { input: ["passport"], output: ["bookingReference"] },      // or: sensitive: ["passport"]
  execute: async (input) => { /* … */ },
});

// 2. in the schema (Standard JSON Schema keeps it): any property with `x-sensitive: true` or `format: "password"`
z.object({ cardNumber: z.string().meta({ "x-sensitive": true }) });
```

```html
<!-- 3. in the page: the control itself -->
<input name="promo" data-agent-sensitive>
<input name="card" autocomplete="cc-number">     <!-- detected without any attribute -->
```

```tsx
// page-wide rules
<WebAgentsProvider redact={{ keys: (d) => [...d, "loyaltyId"], patterns: { phone: true }, style: "indexed" }}>
// no framework
configureRedaction({ paths: ["output.*.address"], allowQuery: ["page", "sort"] });
// server
createChatHandler({ agents, redact: { keys: (d) => [...d, "tenantSecret"] }, observability });
```

### 8.3 Where the library applies it (the contract)

| # | Place | Today | After |
|---|---|---|---|
| 1 | `fill` event value, the cursor's live region and spoken text (`core/visuals.ts`) | only `type="password"` | `isSensitiveControl(el)` or the tool's `sensitive` list → `mask()` |
| 2 | Devtools call log: `args`, `fills`, `result` (`devtools/store.ts`), "copy as code" | raw | redacted for display and copy; a "reveal" toggle in the panel, dev only |
| 3 | Chat tool card: input and output shown to the person (`ToolCallCard.tsx`, registry `agent-tool`) | raw | the tool's `sensitive` fields masked; the person's own typed message is never altered |
| 4 | `AgentRunEvent` `input` / `output` given to `onAgentRun` listeners | n/a (new) | redacted by default; `onAgentRun(listener, { raw: true })` for the app's own trusted code |
| 5 | Telemetry spans, browser and server, and the relay | n/a (new) | always, last in the pipeline, even with `recordInputs/Outputs` on |
| 6 | URLs: `page.url` in the POST body, the page-move note sent to the model (`withPageMoves`), `webmcp.page` attributes | full `location.href` / path + query + hash | `redactor.url()`: reset tokens and emails in query strings never leave the page. **[R3]** Two strengths, because rule 9 below and the acceptance list both say the model keeps what it needs: for telemetry, logs and attributes, every query value outside `allowQuery` is redacted (strict, as written here); for the two URLs the **model** reads (`page.url` and the page-move note), credentials are dropped and only a parameter whose name is a sensitive key or whose value matches a detector (email, token, card…) is redacted, so `?from=CAI&to=LHR` still reaches the model and `?token=abc` does not (`redactor.url(value, { for: "model" })`) |
| 7 | Console output: every `console.error/warn` that prints an error, input or result. **[R3]** 17 `console.error` / `warn` call sites today, not 12: chat 9 (`server/handler.ts` ×4, `server/turnstile.ts`, `adapter/cloud.ts`, `session/restore-journal.ts`, `session/use-agent-session.ts` ×2), core 6 (`web-tool.ts` ×2, `registry.ts`, `web-agents.ts`, `events.ts`, `model-context.ts`), `devtools/vanilla.tsx`, `react/provider.tsx`; core also has 2 `console.info` (`web-tool.ts`, `polyfill/index.ts`) that print fixed text. Those that print a caught value or tool data are the sink; fixed strings stay as they are | raw error objects | `redactor.error(err)`; provider errors can echo an API key |
| 8 | Server logs and `onRefused` / `describeModelError` | raw | redacted; request bodies are never logged |
| 9 | **What the model receives** (tool results, tool inputs echoed back) | raw | **unchanged by default** (the model usually needs the data). Opt in per tool with `sensitive: { output: [...], hideFromModel: true }`: the field reaches the page and the person, the model gets the token |
| 10 | **[R3]** Chat restore (0.4.0): the conversation and URL / app snapshots kept in `sessionStorage`; a `fill` event's `from` | history is stored as sent; `from` is withheld for `type="password"` only (`control` is always sent) | stored history stays raw (it is what the model is sent next turn, same rule as row 9, and it never leaves the browser); `from` is withheld for any `isSensitiveControl` field or `sensitive` parameter, so restore leaves such a field as it is, exactly as it does for a password today; `control` is sent as before, and the `fill` event's shape does not change. `hideFromModel` fields are stored as their token |

Not redacted, on purpose: `AgentEvent`s delivered to `onAgentEvent` listeners keep `args` and `result` as today (the
visual layer and existing integrations depend on them); only `fill.value` is masked. Document it.

### 8.4 Implementation sketch

```ts
export function createRedactor(options: RedactOptions = {}): Redactor {
  const keys = new Set((typeof options.keys === "function" ? options.keys(DEFAULT_SENSITIVE_KEYS) : (options.keys ?? DEFAULT_SENSITIVE_KEYS)).map(norm));
  const allow = new Set((options.allowKeys ?? []).map(norm));
  const rules = compilePatterns(options.patterns);
  const index = new Map<string, string>();                                  // "indexed": value → token, per scope

  const isSensitiveKey = (key: string, extra?: readonly string[]): boolean => {
    const k = norm(key);
    if (allow.has(k)) return false;
    if (extra?.some((e) => norm(e) === k)) return true;
    // [R3] by trailing words, and by trailing characters only for entries of 5+ letters: see `keys` in §8.1
    const parts = words(key);                                               // "userApiKey" → ["user", "api", "key"]
    for (let i = 0; i < parts.length; i++) if (keys.has(parts.slice(i).join(""))) return true;
    for (const s of keys) if (s.length >= 5 && k.endsWith(s)) return true;  // "accesstoken", "userpassword"
    return false;
  };

  const scan = (s: string): string => {
    let out = s.length > maxString ? `${s.slice(0, maxString)}…` : s;
    for (const rule of rules) out = out.replace(rule.pattern, (m) => (rule.validate && !rule.validate(m) ? m : replaceWith(m, rule.label, rule.style)));
    return out;
  };

  const walk = (value: unknown, path: string, key: string | undefined, ctx: Ctx, depth: number, seen: WeakSet<object>): unknown => {
    try {
      // [R3] keyed values only: at the root a throwing `custom` would turn the whole object into the token,
      // and the §8.5 test expects `{ a: "[REDACTED]" }`
      const own = key === undefined ? undefined : options.custom?.(value, { key, path, kind: ctx.kind ?? "attribute", tool: ctx.tool });
      if (own !== undefined) return own;
      if (key !== undefined && (isSensitiveKey(key, ctx.sensitive) || matchesPath(path))) return replaceWith(String(value ?? ""), key, style);
      if (typeof value === "string") return looksLikeJson(value) ? reserialize(value) : looksLikeUrl(value) ? url(value) : scan(value);
      if (value === null || typeof value !== "object") return value;
      if (value instanceof Date) return value;
      if (seen.has(value)) return "[Circular]";
      if (depth >= maxDepth) return "[Truncated]";
      seen.add(value);
      return Array.isArray(value)
        ? value.map((v, i) => walk(v, `${path}.${i}`, key, ctx, depth + 1, seen))
        : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, path ? `${path}.${k}` : k, k, ctx, depth + 1, seen)]));
    } catch {
      return token;                                                         // a failing rule redacts, never leaks
    }
  };
  /* …assemble Redactor: (value, ctx) => walk(value, "", undefined, ctx ?? {}, 0, new WeakSet()), text, url, headers, error, extend, scope… */
}
```

### 8.5 Tests

```ts
import { createRedactor, mask } from "@webmcp-agents/core/redact";

const redact = createRedactor();

it.each([
  [{ password: "hunter2" }, { password: "[REDACTED]" }],
  [{ "Api-Key": "abc" }, { "Api-Key": "[REDACTED]" }],
  [{ authToken: "abc" }, { authToken: "[REDACTED]" }],
  [{ tokenCount: 12 }, { tokenCount: 12 }],
  [{ note: "mail sara@example.com" }, { note: "mail [REDACTED]" }],
  [{ card: "4242 4242 4242 4242" }, { card: "[REDACTED]" }],
  [{ order: "1234 5678 9012 3456" }, { order: "1234 5678 9012 3456" }],          // fails Luhn: not a card
  [{ body: '{"secret":"x","qty":2}' }, { body: '{"secret":"[REDACTED]","qty":2}' }],
])("redacts %j", (input, expected) => expect(redact(input)).toEqual(expected));

it("does not mutate, survives cycles, never throws", () => {
  const input: Record<string, unknown> = { password: "x" };
  input.self = input;
  const out = redact(input);
  expect(input.password).toBe("x");
  expect(out.self).toBe("[Circular]");
  expect(createRedactor({ custom: () => { throw new Error("bad rule"); } })({ a: 1 })).toEqual({ a: "[REDACTED]" });
});

it("keeps a trace readable with indexed tokens", () => {
  const r = createRedactor({ style: "indexed" }).scope();
  expect(r({ from: "a@x.com", to: "b@x.com", cc: "a@x.com" })).toEqual({ from: "[EMAIL_1]", to: "[EMAIL_2]", cc: "[EMAIL_1]" });
});

it("cleans URLs", () => {
  expect(redact.url("https://user:pw@shop.test/reset?token=abc&page=2#frag")).toBe("https://shop.test/reset?token=[REDACTED]&page=[REDACTED]");
  expect(createRedactor({ allowQuery: ["page"] }).url("https://shop.test/list?page=2&email=a@b.co")).toBe("https://shop.test/list?page=2&email=[REDACTED]");
});

it("masks", () => expect(mask("4242424242424242", "partial")).toBe("42••••42"));
```

**[R3]** Notes for making these tests pass as written, and the failure cases to add beside them:
- `url()` rebuilds the query string by hand. `URLSearchParams` / `URL.search` would percent-encode the token
  (`token=%5BREDACTED%5D`) and the "cleans URLs" test would fail. A string that does not parse as a URL is scanned as text.
- Add: `timespan`, `japan`, `spin` are **not** redacted; `user_api_key`, `x-auth-token`, `cardNumber`, `card_pin`, and the
  run-together `accesstoken`, `refreshtoken`, `userpassword`, `clientsecret` are.
- Add: a `Map`, `Set`, `Error`, typed array, `BigInt`, getter that throws, and a frozen object each come back
  without a throw (a throwing getter's value is the token).
- Add: a `PatternRule` whose `validate` throws, and a pattern without the `g` flag, redact rather than leak or loop.
- Add: `maxDepth` and `maxStringLength` at their limits; a 1 MB string returns in bounded time (no catastrophic regex).
- Add: `configureRedaction` called twice, and after a sink already ran, changes every sink (R-RED-1).
- Add: `isSensitiveControl` for each `autocomplete` token in §8.1, `type="password"`, `[data-agent-sensitive]` on
  the control and on an ancestor, and a plain text input (false).

End-to-end leak test (one per sink, same fixture): run a tool with a card number, a password field, an email in a
result and a `?token=` URL, then assert the canary strings appear in none of: devtools store, `onAgentRun` events,
exported spans (browser, server, relay), the POST body's `page.url`, console output (spy), and the tool card's DOM.

### Requirements

- **R-RED-1** One redactor per page and per server SHALL be used by every library sink in §8.3 rows 1 to 8; configuring it once SHALL change all of them.
- **R-RED-2** Redaction SHALL be on by default, run after user processors, never mutate its input and never throw; a failing rule SHALL redact the value.
- **R-RED-3** A tool's `sensitive` fields, `x-sensitive` schema properties and sensitive controls SHALL be masked in events, UI, devtools, logs and telemetry.
  - *Scenario:* a tool with `sensitive: ["passport"]` is called with `passport: "A1234567"` → that string appears in no sink; the tool's `execute` still receives it.
- **R-RED-4** URLs leaving the page SHALL carry no credentials, no hash, and no query value outside `allowQuery`.
- **R-RED-5** What the model receives SHALL be unchanged unless the tool opts in with `hideFromModel`.
- **R-RED-6** The `/redact` entry SHALL NOT be pulled into `core`'s main entry unless used (size budgets unchanged; `visuals.ts` imports only `isSensitiveControl` and `mask`).

---

## 9. Capability: `testing-kit` (new `@webmcp-agents/testing`, built on Vitest)

### 9.1 What the repo has today (checked)

- `packages/core/src/test-utils.ts`: `fixture`, `cleanupFixtures`, `uniqueName`, `recordEvents`, `until`, `toolForm`, `resultText`, `cursorVisible`. "Not exported from the package."
- `packages/chat/test/browser-utils.ts`: a second copy of `fixture`, `uniqueName`, `until`, plus `echoForm`.
- `packages/chat/test/mock-model.ts`: `scriptedModel(steps)` on `MockLanguageModelV4` + `convertArrayToReadableStream` from `ai/test`.
- **[R3]** Five hand-written `fakeAdapter` functions in chat's tests, not three (`agent-chat`, `agent-session`,
  `page-moves`, `use-agent-chat`, `web-agent-invoke` `.browser.test.tsx`).
- **[R3]** `packages/devtools/src/test-utils.ts`: a third copy of the browser helpers.
- **[R3]** 38 test files import these helpers: core 11, chat 15, devtools 4, react 8.
- `examples/*/e2e/agent.ts`: `open`, `run`, `list`, `parkedOn` for Playwright, copied per example (ecommerce,
  flights, nextjs; the playground has no e2e).

So the helpers exist, duplicated and private. This capability publishes one copy, adds Vitest fixtures and matchers on
top, and moves the repo's own tests onto it (which is also its test suite).

### 9.2 Package shape

`@webmcp-agents/testing`: peers `vitest >=4` (required) **[R3: was `>=3`; the browser project below uses
`playwright()` from `@vitest/browser-playwright`, which is Vitest 4+, and the repo runs 5.1]**, `@webmcp-agents/chat`,
`@webmcp-agents/telemetry`, `@playwright/test`, `@vitest/browser-playwright`, `vitest-browser-react`, `react`, `ai`
(all optional). Never imported by a runtime package (a Biome rule). An entry that needs a missing optional peer
fails at import with one sentence naming the package to install, never with a bare module-not-found.

| Entry | For | Contents |
|---|---|---|
| `.` | any test | `test` (extended), `mockTool`, `callTool`, `fixture`, `until`, `recordEvents`, `uniqueName`, `fakeUser`, `resultText` |
| `./matchers` | `setupFiles` | registers the `expect` matchers + their types |
| `./setup` | `setupFiles` | matchers + polyfill + reduced motion + auto cleanup + deterministic ids |
| `./vitest` | config | `webAgentsProject("unit" \| "browser", overrides?)` |
| `./chat` | agents, chat UI | `mockAdapter`, `text`, `toolCall`, `reasoning`, `fail`, `mockChatServer`, `renderChat` |
| `./server` | `/api/chat` | `mockModel`, `chatRequest`, `readChatStream`, `withSession` |
| `./telemetry` | spans | `memoryExporter`, `spanTree` |
| `./playwright` | e2e | `openApp`, `runTool`, `listTools`, `parkedOn`, `confirm` |

### 9.3 Config: two lines

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { webAgentsProject } from "@webmcp-agents/testing/vitest";

export default defineConfig({
  test: { projects: [webAgentsProject("unit"), webAgentsProject("browser")] },
});
```

```ts
// what webAgentsProject returns (so it is not magic)
webAgentsProject("unit")    → { test: { name: "unit", environment: "node", include: ["**/*.test.{ts,tsx}"], exclude: ["**/*.browser.test.*"], setupFiles: ["@webmcp-agents/testing/matchers"] } }
webAgentsProject("browser") → { test: { name: "browser", include: ["**/*.browser.test.{ts,tsx}"], setupFiles: ["@webmcp-agents/testing/setup"],
                                 browser: { enabled: true, provider: playwright(), instances: [{ browser: "chromium" }], viewport: { width: 414, height: 800 } } },
                                 optimizeDeps: { include: ["react", "react-dom", "react-dom/client"] } }   // one React copy (CLAUDE.md gotcha)
```

`./setup` makes runs predictable: installs the polyfill, forces reduced motion so the cursor snaps (no animation
waits), seeds ids (`u-1`, `a-1`, `call-1`…), destroys visuals and removes fixtures after each test, and fails a test
that leaves a tool call in flight or a tool registered.

### 9.4 Fixtures (`test.extend`)

```ts
import { expect, test } from "@webmcp-agents/testing";

test("adds to the cart", async ({ tools, events, user, mount }) => {
  //            tools:  call(name, input) · list() · mock(name, impl) · settled()
  //            events: every AgentEvent, with helpers  · user: trusted input · mount: fixture(html | JSX)
  mount(<WebAgentsProvider><Catalog /></WebAgentsProvider>);
  const result = await tools.call("add_to_cart_mug-01", { qty: 2 });

  expect(result).toBeToolResult(/2 × Field Mug/);
  expect(events).toHaveFilled("qty", "2");
  expect(events).not.toHaveParked();
});
```

| Fixture | Type | Notes |
|---|---|---|
| `tools` | `ToolsFixture` | `call` goes through core's `executeTool` (the agent's path); `mock` registers a `vi.fn`-backed tool, auto-unregistered |
| `events` | `EventLog` | `recordEvents()` started before the test, stopped after |
| `user` | `FakeUser` | `confirm(name?)`, `moveOn()`, `scroll()`, `type()`: trusted input through `vitest/browser` `userEvent` (only trusted input counts as the person) |
| `mount` | `(ui) => HTMLElement` | HTML string or JSX; removed after the test |
| `runs` | `RunLog` | every `AgentRunEvent` (needs `chat`) |
| `spans` | `MemoryExporter` | `observeAgents` wired to memory (needs `telemetry`) |
| `redactor` | `Redactor` | a fresh page redactor per test, reset after |

Fixtures are lazy (Vitest only sets up the ones a test destructures), so a Node unit test pays for none of the browser ones.

### 9.5 Matchers

```ts
// tool results
expect(result).toBeToolResult();                         // not an error
expect(result).toBeToolResult("Added 2 × Field Mug");    // string | RegExp | asymmetric matcher on the text
expect(result).toBeToolError();                          // isError
expect(result).toBeToolError("not_found");               // code in "Error [code]: …" and structuredContent.error.code
expect(result).toHaveStructuredContent({ total: 48 });

// the visual layer
expect(events).toHaveStarted("place_order");
expect(events).toHaveFilled("email");                    // (field, value?)
expect(events).toHaveParked("place_order");              // waiting for the person
expect(events).toHaveYielded();                          // the cursor got out of the way
expect(events).toHaveEventOrder(["start", "fill", "park", "result"]);

// agents (WebAgentResult, RunLog, or a mockAdapter)
expect(run).toHaveCalledTool("add_to_cart", { qty: 2 });               // input: partial match
expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);    // exactly, in order
expect(run).not.toHaveCalledTool("place_order");
expect(run).toHaveAnswered(/back in the cart/);
expect(run).toHaveFinishedWith("stop");                                // "max-steps" | "error" | "aborted"
expect(adapter).toHaveBeenOfferedTools(["search_products", "add_to_cart"]);

// telemetry and privacy
expect(spans).toHaveSpan("execute_tool add_to_cart", { "webmcp.tool.confirm": "accepted" });
expect(spans).toBeOneTrace();
expect(spans).not.toContainSensitive(["A1234567", "4242"]);            // also works on events, runs, a Response body, console spies

// chat UI
await expect(chat).toHaveNoHardcodedText();                            // the sentinel-catalog check of §5.4 as a matcher
```

Failures print what happened, not just a diff:

```
expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"])

  Expected tools, in order:  track_last_order → add_to_cart
  Called:                    track_last_order → add_to_cart → place_order
                                                              ^ unexpected
  place_order input: { "confirm": true }
```

### 9.6 Mocks

```ts
// a page tool, as a spy
const add = tools.mock("add_to_cart", async ({ qty }) => `Added ${qty}`);       // schema optional: tools.mock(name, { inputSchema }, impl)
expect(add).toHaveBeenCalledWith({ id: "mug-01", qty: 2 }, expect.anything());
add.mockResolvedValueOnce(toolError("out_of_stock", "Only 1 left."));           // standard vi.fn API

// a model-free agent
import { mockAdapter, text, toolCall, fail, reasoning } from "@webmcp-agents/testing/chat";
const adapter = mockAdapter([toolCall("track_last_order"), toolCall("add_to_cart", { id: "mug-01", qty: 2 }), text("Done.")]);
const adapter2 = mockAdapter((req, step) => (req.tools.some((t) => t.name === "place_order") ? toolCall("place_order") : text("Nothing to order.")));
adapter.requests;            // every AgentRunRequest (tools offered, messages)
adapter.run;                 // a vi.fn
mockAdapter([fail("rate_limited")]);                                            // an adapter error, by code
mockAdapter([text("Thinking… done.", { chunks: 4, delayMs: 0, usage: { inputTokens: 10, outputTokens: 5 } })]);

// the real cloud adapter against a fake /api/chat (wire format, sessions, retries)
import { mockChatServer } from "@webmcp-agents/testing/chat";
const server = mockChatServer({ steps: [toolCall("add_to_cart", { qty: 1 }), text("Added.")], session: true });
const cloud = createCloudAdapter({ fetch: server.fetch });
server.requests[0].body.trace;       // the ids the browser sent
server.respondOnce({ status: 429, headers: { "retry-after": "30" } });

// the server handler
import { chatRequest, mockModel, readChatStream, withSession } from "@webmcp-agents/testing/server";
const model = mockModel([toolCall("add_to_cart", { id: "mug-01" }), text("Added.")]);      // wraps ai/test MockLanguageModelV4
model.calls[0].tools;                // what the model was offered
model.calls[0].prompt;               // what it was sent
```

### 9.7 Whole examples (each is a file in `docs/_examples/testing/`, executed in CI)

**A tool, in Node.**

```ts
import { expect, test } from "@webmcp-agents/testing";
import { addToCart } from "../webmcp-agents/tools/add-to-cart";

test("adds the quantity", async () => {
  expect(await addToCart.invoke({ id: "mug-01", qty: 2 })).toBeToolResult(/2 × Field Mug/);
});
test("answers a schema error instead of throwing", async () => {
  expect(await addToCart.invoke({ id: "mug-01", qty: 0 } as never)).toBeToolError("invalid_input");
});
```

**Confirmation and yielding, in the browser.**

```tsx
test("waits for the person before placing the order", async ({ tools, events, user, mount }) => {
  mount(<WebAgentsProvider><Checkout /></WebAgentsProvider>);

  const call = tools.call("place_order", {});
  await expect.poll(() => events).toHaveParked("place_order");
  expect(orders.get()).toHaveLength(0);

  await user.confirm("Place order");                 // a trusted click on the parked control
  expect(await call).toBeToolResult();
  expect(orders.get()).toHaveLength(1);
});

test("gives up when the person moves on", async ({ tools, events, user, mount }) => {
  mount(<WebAgentsProvider><Checkout /></WebAgentsProvider>);
  const call = tools.call("place_order", {});
  await expect.poll(() => events).toHaveParked();
  await user.moveOn();                               // a trusted pointerdown elsewhere
  expect(await call).toBeToolError("cancelled");
});
```

**An agent, without a model.**

```ts
import { mockAdapter, text, toolCall } from "@webmcp-agents/testing/chat";

test("reorders the last purchase", async ({ mount }) => {
  mount(<WebAgentsProvider><Store /></WebAgentsProvider>);
  const adapter = mockAdapter([toolCall("track_last_order"), toolCall("add_to_cart_mug-01", { qty: 2 }), text("Back in your cart.")]);

  const run = await storeAgent.invoke("Reorder my last purchase.", { adapter });

  expect(run).toHaveCalledTools(["track_last_order", "add_to_cart_mug-01"]);
  expect(run).toHaveAnswered("Back in your cart.");
  expect(adapter).toHaveBeenOfferedTools(expect.not.arrayContaining(["place_order"]));
});
```

**The endpoint.**

```ts
import { chatRequest, mockModel, readChatStream, withSession } from "@webmcp-agents/testing/server";

const handler = createChatHandler({ model: mockModel([toolCall("add_to_cart", { id: "mug-01" })]), tools: [addToCart], session: true });

test("needs a session", async () => expect((await handler(chatRequest({ messages: ["hi"] }))).status).toBe(401));
test("refuses another site", async () => expect((await handler(chatRequest({ messages: ["hi"] }, { origin: "https://evil.example" }))).status).toBe(403));
test("drops tools off the allowlist", async () => {
  const send = await withSession(handler);
  const parts = await readChatStream(await send(chatRequest({ messages: ["hi"], tools: ["add_to_cart", "delete_everything"] })));
  expect(parts).toContainEqual(expect.objectContaining({ type: "tool-call", name: "add_to_cart" }));
});
```

**Privacy, across every sink.**

```ts
test("a passport number leaves the page nowhere", async ({ tools, events, runs, spans, mount }) => {
  const logs = vi.spyOn(console, "error");
  mount(<WebAgentsProvider><TravelerForm /></WebAgentsProvider>);
  await travelerAgent.invoke("Book for Sara, passport A1234567", { adapter: mockAdapter([toolCall("fill_traveler", { fullName: "Sara", passport: "A1234567" }), text("Done.")]) });

  for (const sink of [events, runs, spans, logs]) expect(sink).not.toContainSensitive(["A1234567"]);
});
```

**End to end (Playwright).** `window.agent` exists in development builds (the devtools install it), so e2e runs against `vite dev` or a build with devtools enabled.

```ts
import { expect, test } from "@playwright/test";
import { confirm, listTools, openApp, parkedOn, runTool } from "@webmcp-agents/testing/playwright";

test.use({ reducedMotion: "reduce" });

test("books a flight after the person confirms", async ({ page }) => {
  await openApp(page, "/");                                          // waits for window.agent, then polls for tools
  expect(await listTools(page)).toContain("search_flights");

  await runTool(page, "search_flights", { from: "CAI", to: "LHR", date: "2026-12-20" });
  await expect(page).toHaveURL(/\/results\?/);

  const booking = runTool(page, "book_flight", { id: "SK-204" });
  const button = page.getByRole("button", { name: "Confirm booking" });
  await parkedOn(page, button);
  await confirm(page, button);
  expect(await booking).toMatch(/booked/i);
});
```

### 9.8 Docs: `docs/testing/`

1. Overview: which layer answers which question (table), and the two-line config
2. Test a tool (Node)
3. Test a tool on the page (browser mode; why trusted input; `uniqueName`)
4. Confirmations, yielding, cancelling
5. Test an agent without a model (`mockAdapter`)
6. Test the chat UI (render, custom `messages`, RTL, `toHaveNoHardcodedText`)
7. Test `/api/chat` (`mockModel`, sessions, allowlist, guards)
8. Test privacy and telemetry (`toContainSensitive`, `spans`)
9. End to end with Playwright
10. CI recipe; reference: every fixture, matcher and mock (one page each, generated table)

Each Build page links to its testing page.

### Requirements

- **R-TEST-1** `@webmcp-agents/testing` SHALL be built on Vitest: fixtures through `test.extend`, matchers through `expect.extend` (typed), mocks as `vi.fn`.
- **R-TEST-2** With `webAgentsProject("browser")` a test SHALL need no manual setup or cleanup: polyfill installed, motion reduced, ids deterministic, fixtures and tools removed after each test.
  - *Scenario:* a test leaves a tool call in flight → that test fails with the tool's name.
- **R-TEST-3** An agent SHALL be testable with no model and no network (`mockAdapter`), and the endpoint with no provider key (`mockModel`).
- **R-TEST-4** Every matcher failure SHALL say what was expected and what happened in words (tool names, order, inputs).
- **R-TEST-5** The repo's own tests SHALL use the kit; the private copies (`core/src/test-utils.ts`, `devtools/src/test-utils.ts`, `chat/test/browser-utils.ts`, `chat/test/mock-model.ts`, the five `fakeAdapter`s, `examples/*/e2e/agent.ts`) SHALL be removed **[R3: list completed]**.
  Two limits the migration must respect: core cannot depend on a package that depends on core at build time, so
  `testing` is a `devDependency` of core resolved from source (the `@webmcp-agents/source` condition; Turbo's `test`
  must not need `testing` built first, or there is a cycle); and the "page without `document.modelContext`" tests
  (`web-agents.polyfill.browser.test.ts`, `provider.polyfill.browser.test.tsx`) must keep importing nothing that
  installs the polyfill, so they use `webAgentsProject("browser", { setupFiles: ["@webmcp-agents/testing/matchers"] })`.
- **R-TEST-6** Every snippet in `docs/testing/` SHALL be a file that executes in `pnpm check`.
- **R-TEST-7** No runtime package SHALL import `@webmcp-agents/testing` (bundle budgets unchanged).

---

## 10. Tasks

### Phase 0: tooling
- [ ] 0.1 Add `knip` + `knip.json`; fix or remove every finding (own commit)
- [ ] 0.2 Add `konsistent` + `konsistent.json`; `konsistent validate` passes; fix violations
- [ ] 0.3 Scripts, `pnpm check`, CI steps with GitHub annotations
- [ ] 0.4 `repository.url`, `homepage`, changeset `repo` → `webmcp-agents/webmcp-agents`, `https://webmcp-agents.dev`
- [ ] 0.5 `CLAUDE.md`: Commands + Gotchas
- [ ] 0.6 **[R3]** `packages/vercel-api/README.md`; konsistent example rules split as in §4.2

### Phase 1: redaction (first: everything after it uses it)
- [ ] 1.1 `packages/core/src/redact/` + `./redact` export; size entry in `scripts/size.mjs`
- [ ] 1.2 `isSensitiveControl` + `mask` in `visuals.ts` (replaces the password-only check)
- [ ] 1.3 `sensitive` on `defineWebTool` / `useWebTool`; `x-sensitive` read from the JSON schema; `hideFromModel`
- [ ] 1.4 `configureRedaction`, `<WebAgentsProvider redact>`, `createChatHandler({ redact })`
- [ ] 1.5 Apply at sinks 2, 3, 6, 7, 8 of §8.3 (devtools, tool card, URLs, console, server logs)
- [ ] 1.6 Unit tests of §8.5, with the [R3] failure cases listed there
- [ ] 1.7 **[R3]** Restore: `fill.from` withheld for sensitive controls and parameters; `hideFromModel` tokens in stored history (§8.3 row 10); `restore.browser.test.ts` still passes

### Phase 2: testing kit (second: later phases are written test-first on it)
- [ ] 2.1 Scaffold `packages/testing` (entries, peers, Biome rule, changeset `fixed` group, konsistent rule)
- [ ] 2.2 Move and merge the existing helpers; `setup`, `webAgentsProject`
- [ ] 2.3 Fixtures; matchers (one file each) with typed augmentation; failure messages
- [ ] 2.4 `mockAdapter`, `mockChatServer`, `mockModel`, request helpers; Playwright helpers
- [ ] 2.5 Migrate the repo's tests and the three examples' e2e; delete the private copies. **[R3]** In this order, the suite green after each: core (11 files), devtools (4), react (8), chat (15, five `fakeAdapter`s), then e2e
- [ ] 2.6 The kit's own tests (matchers pass and fail with the expected message)

### Phase 3: chat customization
- [ ] 3.1 Inventory every string and every raw CSS value (a script that lists them; attach output to the PR)
- [ ] 3.2 `customize/` module: types, `en`, `createTranslator`, `themeToCssVars`, `deepMerge`
- [ ] 3.3 Tokenize `chat.css` (grouped names, old names as fallbacks, logical properties)
- [ ] 3.4 Thread a `ChatContext` (t, classNames, styles, components, dir, locale) through every component; `data-wa-part` everywhere
- [ ] 3.5 Slots (`components`), `unstyled`, `colorScheme`
- [ ] 3.6 Error codes end to end (adapter, session, server `messages` option); UI translates by code; **[R3]** `useAgentChat({ messages, locale })`
- [ ] 3.7 Locales `ar`, `es` as entries (`satisfies ChatMessages`); `Intl` number, byte and percent formatting
- [ ] 3.8 Registry blocks + `examples/nextjs` copies; tool card masks `sensitive` fields (§8.3 row 3)
- [ ] 3.9 Tests of §5.4 on the kit (`toHaveNoHardcodedText`, RTL, theme → variables); `capture/` stills unchanged. **[R3]** Completes the kit's `renderChat` and `toHaveNoHardcodedText`, shipped as shells in phase 2
- [ ] 3.10 **[R3]** Restore, resize handle, status line and "working" indicator: parts, strings and the `Restore` slot (§5.1); `theme.browser.test.tsx` and `restore.browser.test.ts` pass unchanged

### Phase 4: run telemetry in chat
- [ ] 4.1 `run-events.ts`; `RunRef` through `runAgent`, `invokeAgent`, sessions, `runDelegate`; `{ raw }` option
- [ ] 4.2 Cloud adapter: `trace` body field, `traceparent`, step timing, first token
- [ ] 4.3 Local adapter: step events (no usage)
- [ ] 4.4 Wire: schema, usage as message metadata, `readParts`
- [ ] 4.5 Handler: `telemetry` option, `ChatObservability`, contexts, `onRefused` at every early return, `waitUntil(flush)`
- [ ] 4.6 Tests (kit): event order (delegate, park, abort), ids on the server, no content by default, 0.4.0 interop both ways **[R3]**, a throwing `onAgentRun` listener, a restore mid-conversation keeping the same `conversation` id. Completes the kit's `runs` fixture and the run matchers

### Phase 5: `@webmcp-agents/telemetry`
- [ ] 5.1 Scaffold (exports, tsdown, publint, attw, size script, optional peers: `@opentelemetry/api`, `@opentelemetry/sdk-trace-base`, `@ai-sdk/otel`, the proto and grpc exporters)
- [ ] 5.2 Server: `defineObservability`, resolution order, env parsing, `http/json` exporter, pipeline (processors → mapping → redaction → filter → batch), sampling
- [ ] 5.3 Browser: `observeAgents`, span records, `semconv.ts`, relay exporter, global-provider bridge chunk, `react` entry, `consoleExporter`
- [ ] 5.4 Relay; `vercel-api` wiring and telemetry route; **[R3]** `examples/{ecommerce,flights,playground}/api/telemetry.ts`
- [ ] 5.5 Tests of §7.9; the cross-sink leak test of §8.5; sink 4 and 5 of §8.3. **[R3]** Completes the kit's `spans` fixture, `./telemetry` entry (`memoryExporter`, `spanTree`), `toHaveSpan`, `toBeOneTrace`
- [ ] 5.6 Run by hand against: a local OTel Collector, LangSmith, LangWatch, Langfuse, Sentry, IBM Instana (agentless and host agent). Record results in the PR

### Phase 6: docs, examples, release
- [ ] 6.1 `docs/observability/` (overview, how it resolves, privacy and consent, browser spans, Collector fan-out, `backends/*` recipes with sources)
- [ ] 6.2 `docs/security/redaction.mdx`; `docs/testing/` (ten pages); chat theming and localization pages; token table generated from `chat.css`
- [ ] 6.3 Reference pages for every new export (`check-docs.mjs` passes)
- [ ] 6.4 Examples: `examples/ecommerce` themed + Arabic RTL toggle + a `sensitive` checkout tool; `examples/nextjs` with `defineObservability()`
- [ ] 6.5 Roadmap contracts + dependency direction; `CLAUDE.md`; one changeset (minor)
- [ ] 6.6 `pnpm check && pnpm turbo run check-exports && pnpm e2e`

Order: 0 → 1 → 2 → 3 → 4 → 5 → 6. **[R3]** Revision 2 allowed 3 ∥ 4 and stacked pull requests. Both phases edit
`adapter/cloud.ts`, `session/run-agent.ts` and `server/handler.ts`, so they run in sequence; and the delivery asked
for is one pull request, so each phase is its own commit (or few) on one branch. See §14.

## 11. Acceptance

- [ ] With nothing configured: behavior identical to 0.4.0 **[R3]** (chat restore included) except masking of sensitive fields in events, devtools and the tool card; `core` main-entry sizes unchanged
- [ ] No hard-coded string in the chat; no raw value in `chat.css`; a JSON file alone rebrands and translates it
- [ ] `observability: defineObservability()` + two standard env lines exports to LangSmith; changing only env switches backend
- [ ] A vendor's `SpanExporter` or `SpanProcessor` instance works unmodified; an app's global provider is used and never replaced
- [ ] One turn is one trace with browser and server spans; no credential in the browser
- [ ] The cross-sink leak test passes: canary values appear in no sink
- [ ] The repo's own tests run on `@webmcp-agents/testing`; no private helper copies remain
- [ ] Every docs snippet under `docs/testing/`, `docs/observability/` and `docs/security/redaction` compiles; testing ones execute
- [ ] `pnpm knip` and `pnpm konsistent` are clean and part of `pnpm check`

## 12. To verify during implementation (not to decide)

1. `ai@7.0.163`: per-call `telemetry.integrations` and whether they replace or add to globally registered ones for that call (if they replace, document it; do not work around it with global state).
2. `@ai-sdk/otel`: constructor options of `OpenTelemetry` and `LegacyOpenTelemetry` (a `tracer` option is assumed).
3. `messageMetadata` part shape and usage field names (§6.3).
4. The OpenTelemetry API's global registry key for browser-side detection (§7.5).
5. Every value in the recipes table (§7.8), on the vendor's own docs, the day the page is written. For Instana (§7.8.1): `http/json` acceptance, the identity requirement on serverless, and which attributes its GenAI views read.
6. konsistent rule types beyond the four documented, and its case helpers (§4.2).
7. `waitUntil` on each host the examples deploy to.
8. Vitest 5: `test.extend` lazy fixtures in browser mode, and typing of custom matchers (`interface Matchers<T>` augmentation).

9. **[R3]** How to tell a registered global tracer provider from the API's default proxy, and how to reach
   `forceFlush` through it, in the `@opentelemetry/api` version installed (§7.4).
10. **[R3]** Whether konsistent treats a `paths` pattern with no placeholder (`examples/nextjs/webmcp-agents`) as one match (§4.2).
11. **[R3]** That core's tests can import `@webmcp-agents/testing` from source without a Turbo build cycle (R-TEST-5).

If an item cannot be verified, ship the generic path and say so in the PR.

## 13. Recommendations (not in scope unless accepted)

1. **Ship phases as separate releases if the change drags.** Redaction + testing kit + tooling are valuable alone (0.5.0); theming (0.6.0); telemetry (0.7.0). One OpenSpec change can still track all of it.
2. **Add a Collector config to the repo** (`examples/otel-collector.yaml`) and make it the documented way to reach two or more backends. It removes the "legacy vs genai attributes" problem from app code: the Collector can transform.
3. **A semconv snapshot test.** One golden file of span names and attribute keys per span kind. Any change to it is a visible, reviewed diff, which matters while the GenAI conventions are still unstable.
4. **Accessibility gate for the customizable chat.** Run axe in the chat's browser tests for the default theme, the dark theme and RTL; publish minimum contrast guidance next to the token table. Custom themes are where contrast breaks.
5. **Locale completeness by type.** `export const ar = { … } satisfies ChatMessages` makes a missing key a compile error; a test asserts no locale value equals the English one by accident.
6. **Cost visibility.** Usage now reaches the browser: add an optional `onUsage` callback and a per-session token budget guard in `vercel-api`, next to the request-count limits.
7. **A `doctor` script.** `pnpm dlx @webmcp-agents/telemetry doctor` prints what §7.2 resolved to, sends one test span and reports the backend's HTTP status. Most "no traces" reports are a wrong endpoint path.
8. **Document the threat model for redaction.** It reduces accidental leakage; it is not a security boundary against a hostile page or a model that repeats data in prose. Say that plainly on the redaction page.
9. **Keep `AgentEvent` stable; version `AgentRunEvent`.** Mark `onAgentRun` and the telemetry package `@experimental` for one minor so span and event shapes can still move.
10. **Later, not now:** user feedback mapped to backend scores, evals from recorded runs (`mockAdapter` can replay a recorded script), a devtools "Trace" tab reading the same events.

**[R3]** Taken into scope from this list, because they are nearly free and guard quality: 5 (already task 3.7:
`satisfies ChatMessages`) and 9 (`onAgentRun` and `@webmcp-agents/telemetry` carry `@experimental` in their TSDoc
for this minor). The other eight stay recommendations and are listed as such in `proposal.md`.

---

## 14. Delivery **[R3, new]**

### 14.1 Step 1: the OpenSpec change (no project code; then stop for review)

`openspec new change add-observability-chat-theming-testing-tooling` (schema `spec-driven`; the root exists and has
no changes or specs yet), then each artifact from `openspec instructions <artifact>`:

| Artifact | Built from | Rule |
|---|---|---|
| `proposal.md` | §0, §1, §2, §11, §13 | why, what changes, capabilities, impact, acceptance, what is out of scope |
| `design.md` | §3 to §9, §12 | every code block and table **unchanged**, [R3] corrections applied; §12 items as open questions, each with its fallback and the task that settles it |
| `specs/<capability>/spec.md` ×6 | the `R-*` lists | `## ADDED Requirements`; each `R-*` keeps its id in the title, uses SHALL, and has one or more `#### Scenario` (WHEN / THEN). The six scenarios given are kept; every other requirement gets a success scenario and the failure scenarios listed in §6, §7.9, §8.5 |
| `tasks.md` | §10 | all 47 tasks with their numbers; each phase ends with the gate and a commit |
| `source/plan-17-r3.md` | this file | the full text travels with the change and is named in `design.md` as the tie-breaker |

Before presenting it: `openspec validate` passes, and a check script counts that all 33 requirement ids, 47 task
numbers, 9 decisions, 9 acceptance items, 11 verify items, 10 recommendations and every code block of this file
appear in the artifacts. A fresh agent that has not seen the drafts then compares this file with the artifacts
section by section and reports anything missing or weakened; its report is shown with the change.

### 14.2 Step 2: implementation, one sub-session per phase

One branch, `feat/observability-chat-theming-testing-tooling`. One writer at a time in this checkout.

| Phase | Model / effort | Why this model |
|---|---|---|
| 0 Tooling | Sonnet 5.5 / medium | config-driven, mechanical fixes |
| 1 Redaction | Opus 5.5 / medium | privacy-critical; crosses core, react, chat, devtools |
| 2 Testing kit + migrating ~40 test files | Opus 5.5 / medium | public API design and a wide refactor |
| 3 Chat customization | Opus 5.5 / medium | the largest surface: CSS, a11y, i18n, slots |
| 4 Run telemetry in chat | Opus 5.5 / medium | wire compatibility and event ordering |
| 5 `@webmcp-agents/telemetry` | Opus 5.5 / medium | the OTel pipeline and the no-global-state rule |
| 6a Docs | Opus 5.5 / medium | pages people read; every snippet a compiled file |
| 6b Examples, roadmap, `CLAUDE.md`, changeset, final gate | Sonnet 5.5 / medium | follows the docs |

Every session's brief gives: its tasks and spec files; the sections of this file it implements, to read in full;
Serena for navigating and editing code; `rtk` for commands; TSDoc on every export and every option (what it is for,
why, its default, `@example` where a call is not obvious, `@throws` never left implicit, `@experimental` /
`@internal` where they apply); **tests first, failure paths before the happy path**; the phase gate; tick its boxes
in `tasks.md`; commit on the branch; never push; message the lead session when blocked. Docs follow
`docs/README.md` "How these docs are written": plain sentences, the task first, one idea per paragraph.

Skills: `konsistent-config` is installed. The sessions that need them fetch the knip, Vitest, OpenTelemetry,
Langfuse and LangWatch skills or docs from the vendors' own sites before writing config or recipes.

Between phases the lead session (this one) runs the gate itself, reads the diff against the spec, checks the
requirement → test list the phase hands back, and sends fixes to the same session before the next phase starts.
You are asked only for a real blocker (a credential, a decision that changes the public contract).

### 14.3 The mod: the change, mirrored beside the chat

Built first, with the `plugin-authoring` skill. A panel that stays open and updates:

- the seven phases in order, each with its session (a link), model, and state: queued, running, in review, done, blocked;
- under each phase its tasks, read live from `openspec/changes/<name>/tasks.md` (ticked or not);
- the last gate result per phase (`pnpm check`, `check-exports`, and `e2e` at the end) and the commit;
- the six capabilities with their requirement counts covered / total;
- what is happening now, in one line, and anything waiting on you.

`tasks.md` is the single source for task state; the mod adds only what a file of checkboxes cannot hold (session,
state, gate result) in one small status file inside the change folder.

### 14.4 Step 3: verify, archive, one pull request

- `pnpm check && pnpm turbo run check-exports && pnpm e2e` (docs dev server stopped first, or `blume build --isolated`).
- §11, item by item, each with its evidence; the cross-sink leak test; in the browser pane: a tool run with a
  mid-run scroll (the cursor must vanish and the tool still finish), the themed chat, the Arabic RTL toggle, restore.
- Task 5.6: a local OpenTelemetry Collector is run here. LangSmith, LangWatch, Langfuse, Sentry and Instana need
  your keys: with them, each is run and recorded; without, the generic OTLP path ships and the pull request lists
  them as unverified (§12).
- `openspec validate`, sync the delta specs into `openspec/specs/`, archive the change.
- Commit, push, open one pull request: what, why, how; a section per phase; the string and CSS inventory of task
  3.1; the requirement → spec → code → test table; backend results; what is unverified and why.

### 14.5 Files this touches (for orientation; the tasks are the list)

New: `packages/telemetry/`, `packages/testing/`, `packages/core/src/redact/`, `packages/chat/src/customize/`,
`packages/chat/src/locales/{ar,es}.ts`, `packages/chat/src/session/run-events.ts`,
`packages/chat/src/server/telemetry.ts`, `docs/observability/`, `docs/testing/`, `docs/security/redaction.mdx`,
`docs/reference/{telemetry,testing}/`, `docs/_examples/{observability,testing}/`, `knip.json`, `konsistent.json`,
`examples/*/api/telemetry.ts`.

Changed: `packages/chat/src/{chat.css,index.ts,types.ts,shared.ts}`, every file in `packages/chat/src/components/`,
`adapter/{cloud,wire}.ts`, `session/{run-agent,use-agent-session,use-web-agent,use-agent-chat}.ts`,
`server/{handler,validate,web-agent}.ts`; `packages/core/src/{visuals,web-tool,events}.ts`, its `package.json`
exports and `scripts/size.mjs`; `packages/react/src/provider.tsx`; `packages/devtools/src/{store,copy-as-code}.ts`
and `ui/call-detail.tsx`; `packages/vercel-api/src/index.ts`; `registry/default/**` and their copies in
`examples/nextjs/components/web-agents/`; every package's `package.json` (`repository`, `homepage`);
`.changeset/config.json`; `biome.json`; `.github/workflows/ci.yml`; root `package.json`; `CLAUDE.md`;
`.agents/plans/00-web-agents-roadmap.md`. Reused, not rewritten: `isCrossSite` and the limiter in
`packages/vercel-api/src/guards.ts`, `executeTool` in `packages/core/src/execute.ts`, `toolError` / `WebToolError`
in `packages/core/src/result.ts`, `callModelContextTool` in `packages/chat/src/tools.ts`.
