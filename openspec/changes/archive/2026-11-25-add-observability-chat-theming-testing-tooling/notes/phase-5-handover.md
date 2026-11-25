# Phase 5 (`@webmcp-agents/telemetry`): hand-over for phase 6

Written by the phase-5 session. Notes, not instructions: the code is the source of truth.

## Where things are

| File | What |
|---|---|
| `packages/telemetry/src/semconv.ts` | every span name, attribute key, event name and scope (exported from `.` and `./server`) |
| `src/shared/types.ts` | structural OTel shapes (`SpanExporter`, `SpanProcessor`, `TracerProvider`, `ReadableSpanLike`), `OtlpTarget`, `Sampling` |
| `src/shared/util.ts` | OTLP JSON values, ids, `isSampled`, `OTEL_API_KEY` + `registeredGlobalTrace()`, `withMappedKeys`, `VERSION` |
| `src/server/config.ts` | pure resolution: `resolveMode` (§7.2), `resolveOtlp` / `resolveTarget`, env parsing, `samplingFromEnv`, `resourceAttributes` |
| `src/server/runtime.ts` | `buildRuntime` (lazy, first request): peers, `globalProvider()`, private `TracerProvider`, per-request integrations, relay re-emission |
| `src/server/tracer.ts` | `requestTracer`: parent from `traceparent`, drops the AI SDK's wrapper spans under a browser parent, adds ids, redacts before the span exists |
| `src/server/pipeline.ts` | the private provider's last processor: mapping → redaction → filter → batch → exporters (each capped) |
| `src/server/otlp-json.ts` | the `http/json` exporter on `fetch` |
| `src/server/relay.ts`, `observability.ts`, `peers.ts`, `log.ts` | the relay; `defineObservability` / `otlp`; literal `import()` per peer (`peerLoaders`, replaced in tests); log-once |
| `src/browser/observe.ts` | `observeAgents()`: the up-front part (subscription, consent at run start, queue) |
| `src/browser/engine.ts` | the span builder (its own chunk, loaded at the first consented run): events → spans → pipeline → batch / bridge |
| `src/browser/bridge.ts`, `targets.ts`, `exporters.ts`, `console.ts` | the page's own provider (own chunk); `exporters` option (own chunk); relay POST; `consoleExporter` |
| `src/react.tsx` | `<ObserveAgents>` |
| `packages/vercel-api/src/telemetry.ts` | `createVercelTelemetryRoute`, `observabilityFor(env)` |
| `packages/testing/src/telemetry/*` | `memoryExporter`, `spanTree`, `readSpans`, the `spans` fixture (`observe-spans.ts`) |

## The API as shipped (all `@experimental`)

- `@webmcp-agents/telemetry/server`: `defineObservability(config?)` → `Observability` (`ChatObservability` + `enabled`,
  `relay(options?)`, `shutdown()`), `otlp(target?)`, `resolveTarget(target, env)`, `RELAY_MAX_BYTES`, the semconv
  constants, the types. Config exactly design §7.3 (`serviceName`, `resourceAttributes`, `exporters`, `spanProcessors`,
  `tracerProvider`, `sampling`, `conventions`, `recordInputs`, `recordOutputs`, `redact`, `metadataMapping`,
  `spanFilter`, `batchSize`, `debug`, `env`). `relay()` returns `(req, ...host) => Promise<Response>`: a host argument
  with `waitUntil` (or Vercel's request context) gets the flush.
- `@webmcp-agents/telemetry`: `observeAgents(options?)` → `StopObserving` (callable, plus `flush(): Promise<void>`;
  an addition to the design's `() => void`, needed by tests and apps), `consoleExporter()`, semconv, types.
  `exporters` also takes a plain string (a relay URL). `[]` means "nowhere to send": nothing built.
- `@webmcp-agents/telemetry/react`: `<ObserveAgents {...ObserveAgentsOptions} />`; `enabled` read from the latest
  props at each run, the rest at mount.
- `@webmcp-agents/chat/server` now also exports `isCrossSite` (documented on `chat-request-schema.md`).
- Kit: `memoryExporter()` is both a browser exporter and an OTel `SpanExporter`; `toHaveSpan(name | RegExp, attrs?)`.

## Env variables honoured

`OTEL_EXPORTER_OTLP_ENDPOINT` (+ `/v1/traces`, not for grpc), `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (as given, wins),
`OTEL_EXPORTER_OTLP_HEADERS` and `…_TRACES_HEADERS` (percent-decoded; a bad entry skipped, logged once),
`OTEL_EXPORTER_OTLP_PROTOCOL` and `…_TRACES_PROTOCOL` (`http/json` default; anything else: off, one error),
`OTEL_EXPORTER_OTLP_TIMEOUT` and `…_TRACES_TIMEOUT` (default 30000), `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`,
`OTEL_TRACES_SAMPLER` + `_ARG` (`always_on`, `always_off`, `traceidratio`; `parentbased_*` read the same),
`OTEL_SDK_DISABLED`, `WEB_AGENTS_OTEL_ENABLED`, `WEB_AGENTS_OTEL_DEBUG`, and `RATE_LIMIT_TELEMETRY_PER_MINUTE` (vercel-api).
The `…_TRACES_*` variants and the timeout variables are additions to design §7.2's table (all standard OTel names).

## Open questions settled

- **2** (`@ai-sdk/otel` constructors), checked in `@ai-sdk/otel@1.0.163` (the version pinned to `ai@7.0.163`; 1.0.181
  pins `ai@7.0.181`): both `OpenTelemetry` and `LegacyOpenTelemetry` take `{ tracer }`. `OpenTelemetry` also has
  `agentSpanName`, `enrichSpan`, `runtimeContext` (off by default: runtime context is emitted as
  `ai.settings.context.*` only when on). This package does not use `runtimeContext` or `enrichSpan`: its request tracer
  sets the `webmcp.*` ids on every span, for both conventions. The root span is started with no context argument, so
  without a global context manager `context.with()` cannot parent it: the request tracer puts it under the
  `traceparent` explicitly (no global state).
- **4** (the browser's registry key), checked in `@opentelemetry/api` 1.10.0 `internal/global-utils`:
  `Symbol.for("opentelemetry.js.api.1")` (major version in the key); its `trace` entry exists only after
  `trace.setGlobalTracerProvider()` succeeded. The browser reads that and loads the bridge chunk only then.
- **7** (`waitUntil`): the chat handler already finds it (option › an argument's `.waitUntil` › Vercel's request
  context, phase 4); the relay does the same for its flush. Vercel is the only host the examples deploy to; on a host
  without it, the batch timer (5 s, unref'd) or the next request's flush sends it.
- **9** (registered provider vs the default proxy): `trace.getTracerProvider()` is always a `ProxyTracerProvider`. A
  provider is registered when the registry's `trace` entry exists **and** its `getDelegate()` is not the no-op provider,
  compared by identity with `new api.ProxyTracerProvider().getDelegate()` (this API copy's singleton) and by
  constructor name `NoopTracerProvider` (another copy's). `forceFlush` is reached through `getDelegate()`. Two API
  copies coexist (`@ai-sdk/otel` brings 1.9.1 as a dependency); the registry is read directly, so either copy's
  registration is seen.
- **1** (from phase 4): per-call integrations replace registered ones in `ai@7`, so the layer passes
  `globalThis.AI_SDK_TELEMETRY_INTEGRATIONS` (read only) along with its own.

## What each recipe page (6.1) must say about `conventions` and `metadataMapping`

- `conventions: "genai"` (default) emits `gen_ai.*`; `"legacy"` emits the AI SDK's `ai.*` spans (`ai.streamText`,
  `ai.streamText.doStream`, attributes `ai.model.id`… and also some `gen_ai.*`) under scope
  `@webmcp-agents/telemetry/legacy`; `"both"` emits each from its own tracer (two sets of model spans). Recipes that
  read `ai.*` (LangWatch, PostHog, Braintrust, W&B Weave, Arize per §7.8) set `"legacy"`.
- With a browser `traceparent`, the AI SDK's own `invoke_agent` / `step N` wrapper spans are not emitted (genai only;
  legacy keeps its tree): the browser's `invoke_agent` is the run span. A backend view keyed on the AI SDK's root span
  name should be checked with that in mind.
- `metadataMapping` copies before redaction, and its **targets are allow-listed keys**: `session.id` and
  `langsmith.trace.session_id` would otherwise be redacted (the default sensitive keys include `session` /
  `sessionid`). `webmcp.session.id` itself IS redacted by default (it is the chat session id); mapping it elsewhere
  exports it raw on purpose. Typical: `{ "webmcp.conversation.id": "session.id" }` (LangSmith:
  `langsmith.trace.session_id`; LangWatch: its thread id key; PostHog: `posthog_distinct_id` for a user id).
- Through an app's global provider (Sentry, `@vercel/otel`), mapping and redaction happen when the span is created;
  `spanFilter` sees the span as it starts. Relayed browser spans through such a provider get new span ids (parents
  first, a 2000-entry map across batches); the run span sits under its `traceparent` id beside the server's step spans,
  and relay `attributes()` go on each span (the resource is the app's).
- Sentry 11 registers a global provider only with `enableOpenTelemetrySetup: true` (see `verification/backends.md`).

## How to run the Collector check

`verification/backends.md` has the config, the `docker run` line, what arrived per protocol, and how to rerun it.

## For phase 6

- `docs/_examples/testing/privacy.browser.test.tsx`: add `runs` and `spans` to the sinks. Needs
  `@webmcp-agents/telemetry` as a docs-examples dependency (Knip will flag it until a file imports it).
- `VERSION` in `src/shared/util.ts` must equal `package.json`'s version (a test fails otherwise): the release bump
  (`scripts/release.mjs` / changesets) must update it, or replace it with a build-time define.
- Bundle: the design's "default bundle ≤ 3 KB" is met for what loads up front (0.66 KB); the span builder is 3.70 KB,
  loaded at the first consented run (size script reports it). Total on a page that runs and consents: about 4.4 KB.
  Measured with `@webmcp-agents/*` external (already on any page that runs agents).
- Examples: telemetry routes exist; no example page calls `observeAgents()` yet (6.4: `examples/nextjs`).
- CLAUDE.md (6.5): the new package, the fence, the gotchas: Vite SSR picks `@opentelemetry/api` 1.9.1's ESM build with
  extension-less imports, so Node test projects that load `@ai-sdk/otel` need
  `server.deps.inline: [/@opentelemetry\/api/, /@ai-sdk\/otel/]` (telemetry and vercel-api configs have it); a browser
  test's stubbed `fetch` must pass non-relay URLs to the real one; never give `observeAgents` an exporter whose
  `flush()` calls back into the observer (infinite recursion; the kit's fixture wraps its exporter for that reason).
- `pnpm check` saw `chat:browser page-moves.browser.test.tsx` ("a stopped run that winds down…") fail once under full
  parallel load; it passes alone (3/3). Pre-existing timing sensitivity, not touched here.
