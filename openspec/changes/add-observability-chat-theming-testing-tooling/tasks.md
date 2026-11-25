# Tasks

Order: 0 → 1 → 2 → 3 → 4 → 5 → 6, one phase at a time (3 and 4 edit the same files). Task numbers are those of
`source/plan-17-r3.md` §10; tasks added by revision 3 or by this file are marked **[R3]** or **[new]**.

For every task: read the design section named in it first (the code blocks there are the contract); write the
failing test before the code, failure paths before the happy path; every export and option gets TSDoc (what it is
for, why, its default). Each phase ends with its gate task and a commit (0.1's fixes are a commit of their own).

Gate: `pnpm check && pnpm turbo run check-exports`.

## 0. Tooling (`repo-tooling`, design §4)

- [x] 0.1 Add `knip` + `knip.json` (design §4.1); fix or remove every finding in its own commit, silencing none. Verify: `pnpm knip` exits 0, and adding an unused export to a package makes it exit non-zero
- [x] 0.2 Add `konsistent` + `konsistent.json` (design §4.2, with the split example rules; no rule requires `agents.ts` of the playground); load the `konsistent-config` skill and the tool's `docs/README.md` first; settle open questions 6 and 10. Verify: `konsistent validate` and `pnpm konsistent` exit 0, and a `packages/chat/src/locales/fr.ts` that does not export `fr` makes it exit non-zero (R-TOOL-1)
- [x] 0.3 Root scripts `knip`, `konsistent`, and `check` as in design §4.3; the two CI steps with `--format github` and `--reporter github-actions` in `.github/workflows/ci.yml`. Verify: `pnpm check` runs both tools before turbo; the workflow file parses (R-TOOL-2)
- [x] 0.4 `repository.url`, `homepage` and the changeset `repo` → `webmcp-agents/webmcp-agents`, `https://webmcp-agents.dev`, in every `package.json` and `.changeset/config.json`. Verify: a search for `mustafaskyer/web-agents` finds nothing outside changelogs
- [x] 0.5 `CLAUDE.md`: Commands (knip, konsistent) and Gotchas (what each rule checks, how to fix a finding). Verify: the two commands appear and run as written
- [x] 0.6 **[R3]** `packages/vercel-api/README.md` (what it is, private, link to its reference pages). Verify: `published-package-shape` passes for every package
- [x] 0.7 **[new]** Phase gate. Verify: `pnpm check && pnpm turbo run check-exports` passes; commit

## 1. Redaction (`data-redaction`, design §8). First: everything after it uses it

- [x] 1.1 `packages/core/src/redact/` (`createRedactor`, `getRedactor`, `configureRedaction`, `mask`, `isSensitiveControl`, `DEFAULT_SENSITIVE_KEYS`) + the `./redact` export; a size entry in `packages/core/scripts/size.mjs` (≤ 2.75 KB). Verify: the unit tests of 1.6 pass; `pnpm --filter @webmcp-agents/core size` shows visuals ≤ 10.55 KB, whole ≤ 18.6 KB, redact ≤ 2.75 KB (R-RED-2, R-RED-6)
- [x] 1.2 `isSensitiveControl` + `mask` in `visuals.ts`, replacing the password-only check (sink 1: `fill` value, live region, spoken text). Verify: browser tests for `type="password"`, each `autocomplete` token, `data-agent-sensitive` on the control and on an ancestor, and a plain input (not masked) (R-RED-3)
- [x] 1.3 `sensitive` on `defineWebTool` / `useWebTool` (array or `{ input, output, hideFromModel }`); `x-sensitive` and `format: "password"` read from the JSON schema. Verify: a type test for the option; a tool with `sensitive: ["passport"]` still receives the real value in `execute`; with `hideFromModel` the next model request holds the token while the page shows the value; `onAgentEvent` listeners still get `args` and `result` (R-RED-3, R-RED-5)
- [x] 1.4 `configureRedaction`, `<WebAgentsProvider redact>`, `createChatHandler({ redact })`. Verify: configuring once changes every sink already wired; a second call replaces the first (R-RED-1)
- [x] 1.5 Apply at sinks 2, 3, 6, 7, 8 of design §8.3: devtools log, fills, result and "copy as code" with a dev-only reveal toggle; the chat tool card; URL attributes through the strict `redactor.url()`, and `page.url` and the page-move note through its model strength (credentials and sensitive parameters only); the console call sites that print a caught value or tool data; server logs, `onRefused`, `describeModelError`. Verify: one test per sink asserting the canary strings are absent (R-RED-1, R-RED-4)
- [x] 1.6 Unit tests of design §8.5, with the [R3] failure cases listed there (trailing-word keys, awkward values, throwing rules, limits, hand-built query strings). Verify: `pnpm --filter @webmcp-agents/core exec vitest run --project core:unit` passes
- [x] 1.7 **[R3]** Restore: `fill.from` withheld for sensitive controls and parameters (`control` and the event's shape unchanged); `hideFromModel` tokens in the stored history (design §8.3 row 10). Verify: a new restore test for a sensitive field; `packages/chat/test/restore.browser.test.ts` passes unchanged
- [x] 1.8 **[new]** Reference pages `docs/reference/core/redact.md` (and the `sensitive` option on the `defineWebTool` / `useWebTool` / provider / handler pages), `packages/core/README.md` section. Verify: `pnpm --filter @webmcp-agents/docs test` (links) and `check-docs.mjs` pass
- [x] 1.9 **[new]** Phase gate. Verify: `pnpm check && pnpm turbo run check-exports` passes; commit

## 2. Testing kit (`testing-kit`, design §9). Second: later phases are written test-first on it

- [x] 2.1 Scaffold `packages/testing` (the eight entries of design §9.2, peers with `vitest >=4`, the Biome rule that keeps it out of runtime packages, the changeset `fixed` group, the konsistent matcher rule). Verify: `pnpm --filter @webmcp-agents/testing build` and `check-exports` pass; an import of it from `packages/core/src` fails lint (R-TEST-1, R-TEST-7)
- [x] 2.2 Move and merge the existing helpers (`fixture`, `until`, `recordEvents`, `uniqueName`, `resultText`, `toolForm`, `cursorVisible`, `echoForm`); `./setup` (polyfill, reduced motion, deterministic ids, auto cleanup, in-flight and left-registered checks) and `webAgentsProject`; settle open questions 8 and 11. Verify: a test that leaves a call in flight fails naming the tool; core's tests run with `testing` unbuilt (R-TEST-2, R-TEST-5)
- [x] 2.3 Fixtures (`tools`, `events`, `user` as `fakeUser`, `mount`, `redactor`; `runs` and `spans` as typed shells completed in 4.6 and 5.5), lazy; `mockTool`, `callTool`; matchers, one file each, with typed augmentation and worded failure messages (design §9.5). Verify: a Node test that destructures nothing sets up no browser fixture; a misspelled matcher is a type error (R-TEST-1, R-TEST-4)
- [x] 2.4 `mockAdapter` (+ `text`, `toolCall`, `reasoning`, `fail`), `mockChatServer`, `mockModel`, `chatRequest`, `readChatStream`, `withSession` (`mockChatServer` with `requests` and `respondOnce`; `renderChat` completed in 3.9); Playwright helpers `openApp`, `runTool`, `listTools`, `parkedOn`, `confirm`. Verify: an agent runs with no network; the handler runs with no provider key; a missing optional peer fails with one sentence naming the package (R-TEST-3)
- [x] 2.5 Migrate the repo's tests and the three examples' e2e; delete the private copies. In this order, the suite green after each: core (11 files), devtools (4), react (8), chat (15, five `fakeAdapter`s), then e2e. Verify: none of the files listed in R-TEST-5 exists and no `fakeAdapter` remains; test counts per package are not lower; `pnpm test` and `pnpm e2e` pass
- [x] 2.6 The kit's own tests: every matcher passes and fails with the expected message, negated forms and wrong-input cases included. Verify: `pnpm --filter @webmcp-agents/testing test` passes (R-TEST-4)
- [x] 2.7 **[new]** `packages/testing/README.md`; `docs/reference/testing/` (README with `slug`, `meta.ts`, one page per fixture, matcher and mock). Verify: `check-docs.mjs` passes and the `package-has-reference-docs` rule is satisfied for `testing`
- [x] 2.8 **[new]** A Vitest project for `docs/_examples/testing/` wired into the `test` task, so those files execute (today `docs/_examples` only type-checks). Verify: a deliberately failing example file fails `pnpm check` (R-TEST-6)
- [x] 2.9 **[new]** Phase gate. Verify: `pnpm check && pnpm turbo run check-exports && pnpm e2e` passes; commit

## 3. Chat customization (`chat-customization`, design §5)

- [x] 3.1 Inventory every string and every raw CSS value (a script that lists them). Verify: its output is saved in this change folder (`inventory/strings.txt`, `inventory/css.txt`) for the pull request
- [x] 3.2 `customize/` module: types, `en`, `createTranslator`, `themeToCssVars`, `deepMerge`, `defineChatMessages`, `defineChatTheme`. Verify: unit tests for placeholders, plurals (`ar` forms), functions, a throwing function, malformed plural syntax, missing keys, unknown theme keys (R-CHAT-2, R-CHAT-3)
- [x] 3.3 Tokenize `chat.css`: grouped names, the 18 old names as fallbacks per the mapping table, logical properties. Verify: `chat-css.test.ts` (Node) finds no raw value and no physical side; `theme.browser.test.tsx` passes unchanged (R-CHAT-3, R-CHAT-7)
- [x] 3.4 Thread a `ChatContext` (t, classNames, styles, components, dir, locale) through every component; `data-wa-part` and state attributes everywhere. Verify: a test that drives every UI state and finds each part name at least once and no element without it (R-CHAT-4)
- [x] 3.5 Slots (`components`), `unstyled`, `colorScheme` (auto keeps ancestor `data-theme`, then the OS). Verify: a replaced `ToolCard` renders with its call; `unstyled` keeps roles and labels; ancestor `data-theme="dark"` still wins (R-CHAT-5, R-CHAT-7)
- [x] 3.6 Error codes end to end (adapter, session, the server `messages` option), per the table in design §5.3; the UI translates by code; `useAgentChat({ messages, locale })`; the English `error` text kept for non-UI callers. Verify: each row of that table has a test; a 0.4.0-shaped server response still shows translated text (R-CHAT-1)
- [x] 3.7 Locales `ar`, `es` as entries (`satisfies ChatMessages`); `Intl` number, byte and percent formatting. Verify: a missing key is a compile error; a test asserts no locale value equals the English one by accident; an app that does not import a locale does not bundle it (R-CHAT-6)
- [x] 3.8 Registry blocks (`messages`, `locale`, `classNames`) + the `examples/nextjs` copies; the tool card masks `sensitive` fields (design §8.3 row 3). Verify: `pnpm registry:typecheck && pnpm registry:test` pass (the copies are identical)
- [x] 3.9 Tests of design §5.4 on the kit (`toHaveNoHardcodedText`, RTL, theme → variables). Completes the kit's `renderChat` and `toHaveNoHardcodedText`. Verify: the sentinel test passes in every state of design §5.4 (empty, connecting, needs-download, downloading, loading, download failed, answering, a parked tool card, a sub-agent card, restore idle and confirming, the resize handle, each error code); `pnpm capture` stills of the four apps are unchanged (R-CHAT-1, R-CHAT-6, R-CHAT-7)
- [x] 3.10 **[R3]** Restore, resize handle, status line and "working" indicator: parts, strings and the `Restore` slot (design §5.1). Verify: they are in the sentinel test's states; `restore.browser.test.ts` passes unchanged
- [x] 3.11 **[new]** Reference pages for every new chat export (`ChatCustomization`, the helpers, the locales), `packages/chat/README.md`. Verify: `check-docs.mjs` passes
- [x] 3.12 **[new]** Phase gate. Verify: `pnpm check && pnpm turbo run check-exports` passes; commit

## 4. Run telemetry in chat (`agent-run-telemetry`, design §6)

- [x] 4.1 `run-events.ts`; `RunRef` through `runAgent`, `invokeAgent`, sessions, `runDelegate`; the `{ raw }` option; ids from `crypto.randomUUID()`. Verify: event-order tests for a plain run, a delegate, a parked tool and an abort; a throwing listener does not break a run (R-RUN-2)
- [x] 4.2 Cloud adapter: the `trace` body field, `traceparent` per step, step timing, first token. Verify: three steps share `conversation` and `run` with `step` 1 to 3; a second turn has a new `run`; a restore keeps `conversation` (R-RUN-1)
- [x] 4.3 Local adapter: step events (no usage). Verify: an on-device run delivers the same event sequence with no usage (R-RUN-2)
- [x] 4.4 Wire: the schema (`trace`, id pattern, `step` 1 to 64), usage as message metadata, `readParts`, the `step-finish` stream part; settle open question 3. Verify: invalid ids are a 400; a malformed `traceparent` is ignored; usage reaches `step-finish` (R-RUN-1, R-RUN-2)
- [x] 4.5 Handler: the `telemetry` option (`recordInputs`, `recordOutputs`, `functionId`, `metadata`, `usageToClient`, `onRefused`), `ChatObservability`, `trace` and `session` in the `prepareAgent` / `beforeModel` contexts, `onRefused` at every early return, `waitUntil(flush)`; settle open question 1. Verify: defaults record ids and no content; `metadata` throwing does not fail the request; every refusal path calls `onRefused` without content (R-RUN-3)
- [x] 4.6 Tests (kit): event order (delegate, park, abort), ids on the server, no content by default, 0.4.0 interop both ways, a throwing `onAgentRun` listener, a restore mid-conversation keeping the same `conversation` id. Completes the kit's `runs` fixture and run matchers. Verify: `pnpm --filter @webmcp-agents/chat test` passes (R-RUN-4)
- [x] 4.7 **[new]** Reference pages: `on-agent-run.md`, the `telemetry` and `observability` options on `create-chat-handler.md`, `chat-request-schema.md`, `adapter-types.md`; `onAgentRun` marked `@experimental`. Verify: `check-docs.mjs` passes
- [x] 4.8 **[new]** Phase gate. Verify: `pnpm check && pnpm turbo run check-exports` passes; commit

## 5. `@webmcp-agents/telemetry` (`telemetry-exporters`, design §7)

- [x] 5.1 Scaffold (exports `.`, `./server`, `./react`; tsdown, publint, attw, a size script; optional peers `@opentelemetry/api`, `@opentelemetry/sdk-trace-base`, `@ai-sdk/otel`, the proto and gRPC exporters; the Biome fence; the `fixed` group). Verify: `build` and `check-exports` pass; an `@opentelemetry/*` import from `packages/chat/src` fails lint
- [x] 5.2 Server: `defineObservability`, `otlp()`, the resolution order (first match wins), env parsing, the `http/json` exporter, the pipeline (`spanProcessors` → `metadataMapping` → redaction → `spanFilter` → batch), `sampling`, `conventions`, `serviceName`, `resourceAttributes`, `batchSize`, `debug` / `WEB_AGENTS_OTEL_DEBUG`, `flush()`, `shutdown()`; settle open questions 2 and 9. Verify: the env table test of design §7.9; bad headers, unknown protocol, both endpoint forms, a missing peer each behave as specified (R-EXP-1, R-EXP-2, R-EXP-3, R-EXP-6)
- [x] 5.3 Browser: `observeAgents`, span records, `semconv.ts`, the relay exporter, the global-provider bridge chunk, the `react` entry, `consoleExporter`; settle open question 4. Verify: the span tree of design §7.5 from one scripted turn; `enabled()` false exports nothing; the default bundle ≤ 3 KB (R-EXP-4, R-EXP-7)
- [x] 5.4 Relay (`guard`, `maxBytes`, `attributes`); `examples/{ecommerce,flights,playground}/api/telemetry.ts`; `vercel-api` wiring (`createVercelTelemetryRoute`, one `defineObservability()` per cold start, `waitUntil(flush)`); settle open question 7. Verify: each relay refusal, the second redaction pass, `202` with no body on upstream failure, `OTEL_SDK_DISABLED` dropping (R-EXP-4, R-EXP-7)
- [x] 5.5 Tests of design §7.9; the cross-sink leak test of design §8.5; sinks 4 and 5 of design §8.3. Completes the kit's `spans` fixture, `./telemetry` entry (`memoryExporter`, `spanTree`), `toHaveSpan` and `toBeOneTrace`. Verify: the canary strings appear in no sink (devtools store, run events, browser, server and relay spans, `page.url`, console, tool card) (R-EXP-5, R-RED-1)
- [x] 5.6 Run by hand against a local OTel Collector, LangSmith, LangWatch, Langfuse, Sentry, IBM Instana (agentless and host agent). Verify: results recorded in this change folder (`verification/backends.md`); a backend with no credential available is listed as unverified, with the generic path shipped
- [x] 5.7 **[new]** `packages/telemetry/README.md`; `docs/reference/telemetry/` (README with `slug`, `meta.ts`, a page per export), everything marked `@experimental`. Verify: `check-docs.mjs` passes
- [x] 5.8 **[new]** Phase gate. Verify: `pnpm check && pnpm turbo run check-exports` passes; commit

## 6. Guides, examples, release (design §7.8, §9.8)

Reference pages land with their phase (1.8, 2.7, 3.11, 4.7, 5.7). The guides are here because each one spans
several capabilities (the privacy page needs telemetry; the testing pages need the chat and telemetry matchers).

- [x] 6.1 `docs/observability/` (overview, how it resolves, privacy and consent, browser spans, Collector fan-out with a ready `otel-collector.yaml`, `backends/*` recipes, each value verified on the vendor's docs that day with the source linked; open question 5). Verify: every code block is a file in `docs/_examples/observability/` that the docs-examples typecheck compiles in `pnpm check`; links validate
- [x] 6.2 `docs/security/redaction.mdx` (with the plain statement of what redaction is not); `docs/testing/` (the ten pages of design §9.8); chat theming and localization pages; the token table generated from `chat.css`. Verify: every testing snippet is a file in `docs/_examples/testing/` that executes in `pnpm check`; each Build page links to its testing page (R-TEST-6)
- [x] 6.3 Reference pages for every new export: a pass over 1.8, 2.7, 3.11, 4.7 and 5.7 for the one template, and anything missed. Verify: `check-docs.mjs` passes; every package has `docs/reference/<pkg>/README.md`
- [ ] 6.4 Examples: `examples/ecommerce` themed + an Arabic RTL toggle + a `sensitive` checkout tool; `examples/nextjs` with `defineObservability()` and a telemetry route. Verify: each example's e2e passes; in the browser pane the themed chat, the RTL toggle and a masked field are seen working
- [ ] 6.5 Roadmap contracts + dependency direction (`.agents/plans/00-web-agents-roadmap.md`); `CLAUDE.md` (structure, architecture, gotchas for the two new packages and the redact entry); one changeset (minor) that states the masking change first. Verify: `pnpm release:status` shows one minor for the fixed group
- [ ] 6.6 `pnpm check && pnpm turbo run check-exports && pnpm e2e`. Verify: all pass; each item of the proposal's Acceptance list is ticked with its evidence

## Workflow follow-up

- Before phase 0: build the progress mod (a panel that mirrors this file: phases, tasks, session, model, state, last gate result, commit).
- Each phase runs in its own sub-session on branch `feat/observability-chat-theming-testing-tooling` (0 and the examples part of 6: Sonnet, medium; 1 to 5 and the docs part of 6: Opus, medium). The lead session runs the gate and reviews the diff against the specs before the next phase starts.
- After 6.6: `openspec validate`, sync the delta specs into `openspec/specs/`, archive the change.
- Commit, push, and open one pull request: what, why, how; a section per phase; the inventories of 3.1; the requirement → spec → code → test table; the backend results of 5.6; what is unverified and why.
