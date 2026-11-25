# Proposal

Target release: **0.5.0** · Baseline: **v0.4.0** (`91db96d`)
Full source: `source/plan-17-r3.md` (plan 17, revision 3). It decides wherever an artifact is silent.

## Why

Five things an app built on `@webmcp-agents/*` cannot do today without forking or guessing:

| Problem today (v0.4.0) | Evidence in the repo |
|---|---|
| The chat cannot be restyled or translated without forking | `packages/chat/src/chat.css` has 18 `--wa-chat-*` variables, 183 lines with a raw value and 14 with a physical `left` / `right`; components hold about 45 hard-coded English strings; 5 of 11 components carry a `data-*` hook, none a stable part name; no `messages` / `classNames` / `components` props; `adapter/cloud.ts` `MESSAGES` and `session/run-agent.ts` build English strings |
| A turn is not traceable | one POST per model step (`stepCountIs(1)`), tools run in the browser, the body has no conversation / run / step id, `AgentStreamPart` has no usage |
| No path to an observability backend | the only hook is `prepareAgent`; nothing sets `telemetry` |
| Users are not told how to test tools and agents | test helpers live in `packages/core/src/test-utils.ts`, `packages/devtools/src/test-utils.ts`, `packages/chat/test/` and `examples/*/e2e/agent.ts`, unpublished and undocumented |
| Conventions are enforced by review only | `CLAUDE.md` lists them; nothing checks them; no dead-code check |

A sixth sits under all of them: the only masking in the repo is a password field's value in the `fill` event. Once
tool inputs and results flow to a devtools log, a tool card, run events and telemetry, every one of those is a place
a card number or a reset token can leak.

## What Changes

Nothing is breaking. Every new prop, option and wire field is optional; a 0.4.0 page works against a 0.5.0 server
and the reverse.

- **Repo tooling.** Knip (unused files, exports, dependencies) and konsistent (structural conventions) run in
  `pnpm check` and in CI with pull-request annotations. `repository.url`, `homepage` and the changeset `repo` move to
  `webmcp-agents/webmcp-agents` and `https://webmcp-agents.dev`.
- **Data redaction.** A new entry, `@webmcp-agents/core/redact`: one redactor per page and per server, on by
  default, applied at every place data leaves a tool call (the `fill` event and live region, the devtools log, the
  chat's tool card, run events, telemetry, URLs, console and server logs). Tools mark fields with `sensitive`; a
  schema with `x-sensitive`; a control with `autocomplete` or `data-agent-sensitive`.
  **What changes by default, all toward showing less:** such values show a mask in the `fill` event's value,
  devtools and the tool card; the page URL sent to the model loses credentials and sensitive parameters; errors
  printed to the console and server logs are redacted. `onAgentEvent` listeners still receive `args` and `result`.
- **Testing kit.** A new package, `@webmcp-agents/testing`, built on Vitest: fixtures (`tools`, `events`, `user`,
  `mount`, `runs`, `spans`, `redactor`), typed matchers, `mockTool`, `mockAdapter`, `mockChatServer`, `mockModel`,
  Playwright helpers, and a two-line config. The repo's own tests move onto it and the private copies are deleted.
- **Chat customization.** `<AgentChat>` and the registry blocks take `theme`, `colorScheme`, `messages`, `locale`,
  `dir`, `classNames`, `styles`, `components` and `unstyled`. Every visual value is a `--wa-chat-*` variable, every
  string comes from a catalog (English built in; `ar` and `es` as entries), every element carries `data-wa-part`,
  the layout mirrors in RTL, and errors travel as codes the UI translates. One message is new: a run that reaches
  its step limit now says so.
- **Agent run telemetry.** Each step request carries `conversation`, `run`, `step` (and `parent` for a sub-agent)
  plus a `traceparent` header. `onAgentRun` delivers run, step and tool events for cloud and on-device runs. The
  handler gains `telemetry` and `observability` options; content is never recorded unless the app opts in.
- **Telemetry exporters.** A new package, `@webmcp-agents/telemetry` (entries `.`, `./server`, `./react`), on the
  OpenTelemetry standard only: OTLP targets, the `OTEL_*` env variables, any `SpanExporter`, `SpanProcessor` or
  `TracerProvider`, and an app's own global provider. `observeAgents()` plus a relay put browser spans in the same
  trace with no backend credential in the page. A backend is a docs recipe, never a code path.
- **Docs and examples.** `docs/observability/` (with one recipe page per backend, sources linked),
  `docs/testing/` (ten pages), `docs/security/redaction.mdx`, theming and localization pages, a reference page per
  new export. Every snippet is a compiled file; the testing ones execute. `examples/ecommerce` gets a theme, an
  Arabic RTL toggle and a `sensitive` checkout tool; `examples/nextjs` gets `defineObservability()`; every example with a chat endpoint gets a telemetry route.

Out of scope, all follow-ups: evals, user-feedback scoring, metrics (counters, histograms), a devtools timeline,
on-device token usage.

### Corrections made while turning plan 17 into this change (revision 3)

The plan was written against v0.3.0; the repo is at v0.4.0. Each is marked `[R3]` in `design.md` where it applies.

| # | Revision 2 said | The repo today | Correction |
|---|---|---|---|
| 1 | Target 0.4.0, baseline 0.3.0 | every published package is 0.4.0 | target 0.5.0; compatibility rules read "0.4.0 and earlier" |
| 2 | span shapes "are those of plan 16" | there is no plan 16 in the repo | the span tree is written out in design §7.5 |
| 3 | 17 `--wa-chat-*` variables | 18 | all 18 stay as fallbacks; mapping table in design §5.3 |
| 4 | `ChatPart` / `ChatMessages` / `ChatComponents` | 0.4.0 added restore, a resize handle, a status line, a "working" indicator, a default suggestion | keys, parts and a `Restore` slot added |
| 5 | nine error codes | two more English failures in `run-agent.ts`; the stream's error `code` is a closed union of four | `aborted`, `run_failed` added; the union is widened |
| 6 | `colorScheme` prop | dark is forced by `data-theme="dark"` on the chat or an ancestor, light by `data-theme="light"` on the chat itself, else the OS decides | `"auto"` keeps exactly that |
| 7 | the raw-values CSS test reads a file inside a browser test | browser tests have no `fs` | it is a Node test |
| 8 | core budget 18.4 KB | 18.5 KB | 10.45 KB / 18.5 KB |
| 9 | sensitive key "equals or ends with" an entry | `timespan`, `japan`, `spin` end with `pan` / `pin` | match by trailing words; by trailing characters only for entries of five letters or more (`accesstoken` still matches) |
| 10 | `custom` runs on every node | at the root a throwing rule would hide the whole object, and the plan's own test expects otherwise | `custom` runs on keyed values only |
| 11 | URL test expects `token=[REDACTED]` | `URLSearchParams` percent-encodes the brackets | the query is rebuilt by hand |
| 12 | 12 console call sites | 17 `console.error` / `warn`, plus 2 `console.info` | the full list is in design §8.3 |
| 13 | sinks 1 to 9 | restore keeps history in `sessionStorage`; `fill.from` is withheld for passwords only | row 10 added; `from` follows sensitive controls; the event's shape does not change |
| 14 | five places with private helpers, three `fakeAdapter`s | a sixth place (devtools), five `fakeAdapter`s, 38 importing files | the removal list is complete |
| 15 | peer `vitest >=3` | the browser project needs Vitest 4+; the repo runs 5.1 | peer `vitest >=4` |
| 16 | every example has `src/webmcp-agents/agents.ts` | playground has none; Next.js keeps the folder at its root | the rule is split; `agents.ts` is required of the Next.js example only |
| 17 | every package has a README | `packages/vercel-api` has none | one is added |
| 18 | `provider.forceFlush()`; "a global provider the app registered" | the API type has no `forceFlush`; `getTracerProvider()` always returns a proxy | both are feature-detected |
| 19 | `OTEL_SDK_DISABLED` disables both sides | a browser cannot read server env | the server exports nothing and the relay drops; the browser uses `enabled` |
| 20 | decisions numbered 1 to 5, 9, 6 to 8 | | the same nine, in order |
| 21 | phases 3 ∥ 4; stacked pull requests | both phases edit the same three files; one pull request was asked for | 3 then 4; one pull request, commits per phase |
| 22 | every query value of the page URL and page-move note is redacted, and both are read by the model | the plan also says the model keeps what it needs; Skyline keeps its search in the URL | two strengths: strict for telemetry and logs; credentials and sensitive parameters only for the model |
| 23 | the kit's `runs`, `spans`, telemetry entry and chat matchers ship in phase 2 | they need phases 4, 5 and 3 | phase 2 ships shells and types; tasks 3.9, 4.6, 5.5 complete them |
| 24 | redact entry ≤ 1.5 KB; core budgets fixed at 10.45 / 18.5 KB | measured in phase 1: the full §8.1 feature set is 2.74 KB, and the sensitive-control check the cursor needs (sink 1) costs 62 B where 3 B were free | redact ≤ 2.75 KB; visuals ≤ 10.55 KB, whole ≤ 18.6 KB (decided 2026-11-25, noted in `size.mjs`). Core's own console lines are not redacted (they print no tool data): a deliberate exception to sink 7 |

## Capabilities

### New Capabilities

- `repo-tooling`: dead-code and structural-convention checks that fail `pnpm check` and annotate pull requests.
- `data-redaction`: one redactor per page and per server, on by default, applied wherever tool data leaves a call;
  ways to mark a field, a schema property or a control as sensitive.
- `testing-kit`: `@webmcp-agents/testing`, the published Vitest fixtures, matchers and mocks for tools, agents, the
  chat UI, the chat endpoint, telemetry and end-to-end runs.
- `chat-customization`: theming, localization, per-part classes and styles, replaceable parts and RTL for
  `<AgentChat>` and the registry blocks.
- `agent-run-telemetry`: run, step and tool ids on the wire, run events in the browser, per-step usage, and the
  handler's telemetry options.
- `telemetry-exporters`: `@webmcp-agents/telemetry`, the OpenTelemetry-standard route from a run to any backend,
  on the server and from the browser through a relay.

### Modified Capabilities

None. `openspec/specs/` is empty: this is the first change in the repo.

## Impact

**Packages.** New: `@webmcp-agents/telemetry`, `@webmcp-agents/testing` (both join the changeset `fixed` group).
New entry: `@webmcp-agents/core/redact`. New entries in chat: `./locales/ar`, `./locales/es`. Changed: `core`
(`visuals.ts`, `web-tool.ts`, `events.ts`), `react` (`redact` prop), `chat` (components, CSS, adapter, session,
server), `devtools` (log, copy as code), `vercel-api` (telemetry route, `waitUntil`), `registry` blocks and their
copies in `examples/nextjs`.

**Public API (all additive).** `defineWebTool({ sensitive })`, `<WebAgentsProvider redact>`,
`createChatHandler({ redact, telemetry, observability, messages })`, `AgentChatProps extends ChatCustomization`,
`onAgentRun`, `AgentStreamPart` `step-finish` and a wider error `code`, the `trace` body field and `traceparent`
header.

**Dependencies.** Root dev: `knip`, `konsistent`. `telemetry`: optional peers `@opentelemetry/api`,
`@opentelemetry/sdk-trace-base`, `@ai-sdk/otel`, the proto and gRPC OTLP exporters. `testing`: peer `vitest >=4`;
optional `@webmcp-agents/chat`, `@webmcp-agents/telemetry`, `@playwright/test`, `@vitest/browser-playwright`,
`vitest-browser-react`, `react`, `ai`.

**Budgets.** Core visuals ≤ 10.55 KB and whole package ≤ 18.6 KB do not move. `core/redact` ≤ 2.75 KB. The
telemetry browser default bundle ≤ 3 KB. All min+gz, each enforced by a size script.

**Tooling and CI.** Root `check` gains `pnpm konsistent && pnpm knip`; `ci.yml` gains two annotated steps; Biome
gains two import fences (`@opentelemetry/*` and `@ai-sdk/otel` only in `packages/telemetry`; `@webmcp-agents/testing`
never in a runtime package).

**Docs.** New `docs/observability/`, `docs/testing/`, `docs/security/redaction.mdx`, `docs/reference/telemetry/`,
`docs/reference/testing/`, `docs/_examples/{observability,testing}/`; `CLAUDE.md` and the roadmap updated.

## Acceptance

- [ ] With nothing configured: behavior identical to 0.4.0 (chat restore included) except masking of sensitive fields in events, devtools and the tool card; `core` main-entry sizes unchanged. (Revision 3 adds to "except": secrets removed from URLs and logs, and the step-limit message; see What Changes)
- [ ] No hard-coded string in the chat; no raw value in `chat.css`; a JSON file alone rebrands and translates it
- [ ] `observability: defineObservability()` + two standard env lines exports to LangSmith; changing only env switches backend
- [ ] A vendor's `SpanExporter` or `SpanProcessor` instance works unmodified; an app's global provider is used and never replaced
- [ ] One turn is one trace with browser and server spans; no credential in the browser
- [ ] The cross-sink leak test passes: canary values appear in no sink
- [ ] The repo's own tests run on `@webmcp-agents/testing`; no private helper copies remain
- [ ] Every docs snippet under `docs/testing/`, `docs/observability/` and `docs/security/redaction` compiles; testing ones execute
- [ ] `pnpm knip` and `pnpm konsistent` are clean and part of `pnpm check`

## Recommendations (not in scope unless marked accepted)

1. **Ship phases as separate releases if the change drags.** Redaction + testing kit + tooling are valuable alone (0.5.0); theming (0.6.0); telemetry (0.7.0). One OpenSpec change can still track all of it.
2. **Add a Collector config to the repo** (`examples/otel-collector.yaml`) and make it the documented way to reach two or more backends. It removes the "legacy vs genai attributes" problem from app code: the Collector can transform.
3. **A semconv snapshot test.** One golden file of span names and attribute keys per span kind. Any change to it is a visible, reviewed diff, which matters while the GenAI conventions are still unstable.
4. **Accessibility gate for the customizable chat.** Run axe in the chat's browser tests for the default theme, the dark theme and RTL; publish minimum contrast guidance next to the token table. Custom themes are where contrast breaks.
5. **Accepted.** Locale completeness by type: `export const ar = { … } satisfies ChatMessages` makes a missing key a compile error; a test asserts no locale value equals the English one by accident. (Task 3.7.)
6. **Cost visibility.** Usage now reaches the browser: add an optional `onUsage` callback and a per-session token budget guard in `vercel-api`, next to the request-count limits.
7. **A `doctor` script.** `pnpm dlx @webmcp-agents/telemetry doctor` prints what the resolution order resolved to, sends one test span and reports the backend's HTTP status. Most "no traces" reports are a wrong endpoint path.
8. **Document the threat model for redaction.** It reduces accidental leakage; it is not a security boundary against a hostile page or a model that repeats data in prose. (The sentence itself is written on the redaction page in task 6.2; a full threat model stays a follow-up.)
9. **Accepted.** Keep `AgentEvent` stable; version `AgentRunEvent`: `onAgentRun` and the telemetry package are `@experimental` for one minor so span and event shapes can still move.
10. **Later, not now:** user feedback mapped to backend scores, evals from recorded runs (`mockAdapter` can replay a recorded script), a devtools "Trace" tab reading the same events.
