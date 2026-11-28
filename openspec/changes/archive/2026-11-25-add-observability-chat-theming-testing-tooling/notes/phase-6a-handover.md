# Phase 6a (docs): hand-over for phase 6b and the lead

Written by the phase-6a session on 2026-11-25. Notes, not instructions: the code and the pages are the truth.

## Pages written

| Folder | Pages |
|---|---|
| `docs/observability/` (new, sidebar order 5) | `index` (the span tree, the four-view complete example), `where-spans-go` (the five rules, the env table incl. `…_TRACES_*`, timeouts, protocols), `privacy` (content off, `recordInputs/Outputs`, `enabled`, redaction last, `metadataMapping` targets raw), `browser-spans` (relay, bundle cost, Web SDK pages), `on-agent-run`, `collector` (fan-out + debug config) |
| `docs/observability/backends/` | `index` (table), `otlp`, `arize`, `braintrust`, `datadog`, `helicone`, `instana`, `laminar`, `langfuse`, `langsmith`, `langwatch`, `new-relic`, `posthog`, `sentry`, `traceloop`, `vercel`, `weave` |
| `docs/security/redaction.mdx` | sink table, three ways to mark, page / server rules, two strengths, `hideFromModel`, not redacted on purpose, "what redaction is not", `Map`/`Set` come back empty |
| `docs/testing/` (new, sidebar order 6) | the ten pages of design §9.8: `index`, `test-a-tool`, `test-a-tool-on-the-page`, `confirmations`, `test-an-agent`, `test-the-chat`, `test-the-endpoint`, `privacy-and-telemetry`, `end-to-end`, `ci` |
| `docs/more/` | `chat-theming.mdx` (three levels, `colorScheme`, `unstyled`, generated token table, contrast table, 0.4.0 names), `chat-localization.mdx` (messages, `ar`/`es`, `locale` vs catalog, RTL, server messages) |
| Build pages | each of the 11 links its testing page (R-TEST-6); `style-the-cursor-and-chat` links the two chat pages |
| Reference (6.3) | type rows added to existing pages (`create-chat-handler`, testing `test`, `user`, `helpers`, `events`, `mount`, `to-have-finished-with`, `runs`, `web-agents-project`, `mock-adapter`, `mock-chat-server`, `mock-model`, `server-requests`, `telemetry`, README); guide links from the telemetry, testing and `core/redact` READMEs. No new API page was needed: phases 1–5 had one per export. |

Sidebar orders changed: Observability 5, Testing 6, More 7 (was 5), Examples 8 (was 6).

## Code behind the pages

- `docs/_examples/observability/` (typecheck project `observability`): layer variants, browser files, `backends/*.ts`,
  `env/*.env`, `otel-collector.yaml` + `.debug.yaml`, `run-collector*.sh`. `vendors/*.d.ts` are type stand-ins for the
  vendor packages, mapped by `paths` in its tsconfig **and in `knip.json`** (so Knip resolves the imports instead of
  needing an ignore). No vendor package is installed anywhere.
- `docs/_examples/{security,chat}/` (typecheck projects `security`, `chat`).
- Framework files: `{vite,nextjs,tanstack-start,astro}` chat routes `*.observed.ts` and telemetry routes;
  `shared/lib/observability.ts`, `astro/src/lib/observability.ts`, `shared/components/observe-runs.tsx` (+ Next.js
  copy), `shared/lib/consent.ts`; `routeTree.gen.ts` gained `/api/telemetry`.
- `docs/_examples/testing/`: new `tool-on-page`, `chat`, `spans` browser tests, `app/quantity-form.tsx`, `ci.yml`;
  `privacy.browser.test.tsx` now checks `events`, `runs`, `spans` and the console; `confirmation` checks
  `toHaveYielded("pointer")`. `@webmcp-agents/telemetry` is a docs-examples devDependency. All execute (15 tests in 8 files; e2e/ is type-checked only).
- `apps/docs/scripts/generate-partials.mjs` writes `docs/_partials/chat-tokens.mdx` (from `chat.css`) and
  `docs/_partials/testing-reference.mdx` (from `docs/reference/testing/*.md`); `--check` runs in the docs app's `test`
  (so `pnpm check` fails on a stale table). `apps/docs/turbo.json` test inputs include `chat.css`.

## Per-recipe verification (all sources read 2026-11-25; links are on each page)

| Backend | Status | Notes / unverified |
|---|---|---|
| Any OTLP / local Collector | **Run** (phase 5, Collector 0.166.0, json/protobuf/grpc). Both YAML files here pass `otelcol validate` 0.166.0 | Grafana Basic-auth composition, SigNoz JSON not stated |
| LangSmith | Not run | OTLP **JSON unconfirmed** → recipe sets `http/protobuf`; `Langsmith-Project` is legacy (agent headers are new, mixing → 400) |
| LangWatch | Not run (type-checked in phase 5) | export is `langwatch/observability`; whether it reads `gen_ai.*` not stated → kept `conventions: "legacy"` |
| Langfuse | Not run | JSON + protobuf confirmed; v6 reads `LANGFUSE_BASE_URL` (not `LANGFUSE_HOST`); its default filter keeps spans with `gen_ai.*` (ours have `gen_ai.operation.name`) |
| Sentry | Offline check only (phase 5) | `enableOpenTelemetrySetup: true` confirmed in Sentry docs (on by default in `@sentry/nextjs`/`sveltekit`); groups by `gen_ai.conversation.id` |
| PostHog | Not run | option is `projectToken` (plan said `apiKey`); env path needs `…_TRACES_ENDPOINT` (`/i/v0/ai/otel`); default `genai` (plan said legacy) |
| Braintrust | Not run | package is `@braintrust/otel` (plan said `braintrust`); JSON confirmed only by its package; default `genai` |
| IBM Instana | Not run (no tenant / agent) | §7.8.1 in full; **JSON unconfirmed** → `http/protobuf`; current host form `otlp-http-<region>-saas.instana.io:443`; GenAI views need `INSTANA_PLUGIN=genai`; identity rule contradictory on IBM's page |
| Datadog | Not run | JSON confirmed; LLM Obs needs `dd_llmobs_enabled=true`; US3/AP1/AP2 hosts not checked |
| Arize | Not run | `openinference-vercel` v3 for ai@7 (genai); Phoenix protobuf only (server source); AX JSON not stated |
| Laminar | Not run | JSON confirmed; LLM views need `lmnr.span.type=LLM`, which we do not set (suggested Collector transform, untried) |
| New Relic | Not run | JSON not stated → protobuf; 4095-char attribute limit |
| Traceloop | Not run | JSON and EU instance not stated → protobuf |
| W&B Weave | Not run | protobuf only; header `wandb-api-key`, routing by resource attributes `wandb.entity`/`wandb.project` (plan's Basic + `project_id` form is gone from the docs) |
| Vercel | Not run | `registerOTel` sets a global provider; its default protocol is protobuf |
| Helicone | Not run | a model gateway (`@helicone/ai-sdk-provider` `createHelicone`), no general OTLP endpoint; model id in the snippet (`claude-4.5-haiku`) is from Helicone's docs |

Full research notes (not in the repo): the session scratchpad `vendors-a.md` / `vendors-b.md`; every fact used is
linked on its page.

## Package findings

- No package bug found. One documentation fact worth a code decision: the layer's default export timeout is 30 s,
  while the OpenTelemetry spec (and `@vercel/otel`) default to 10 s. The pages state the difference; not changed.
- Pre-existing exports with no reference mention (0.4.0, out of this change's scope): core `writeControl`,
  `FieldControl`, `FieldValue`; chat `ChatRestoreSnapshot(s)`, `snapshotsStorageKey`, `DELEGATION_NOTE`; chat/server
  `Effort`, `applyAllowlist`, `buildAllowlist`, `Allowlist`, `createSessionKeeper`, `readCookie`, `TURNSTILE_HEADER`,
  `TURNSTILE_VERIFY_URL`, `ChatSession`, `SessionKeeper`, `_resetModelCache`; vercel-api `secretMissingGuard`,
  `sessionGuard`.

## What phase 6b must make true in the examples (the pages describe these)

- `examples/ecommerce`: a themed chat (a `theme` object with `light`/`dark`, as `more/chat-theming`), an Arabic RTL
  toggle (`locale="ar"` + `messages={ar}` from `@webmcp-agents/chat/locales/ar`), and a checkout tool with `sensitive`
  (a masked field seen in the cursor's events / tool card, as `security/redaction`).
- `examples/nextjs`: `defineObservability()` in a `lib/observability.ts` used by `app/api/chat/route.ts`, an
  `app/api/telemetry/route.ts` with `observability.relay()`, and `<ObserveAgents>` (or `observeAgents()`) on the page
  inside the provider, as `observability/index`. `docs/examples/*.mdx` pages may then list these.
- CLAUDE.md (6.5): `docs/observability/`, `docs/testing/`, the two `more/` chat pages, `generate-partials.mjs` (run it
  after changing `chat.css`), and the `vendors/` stand-ins mapped in `knip.json`.
