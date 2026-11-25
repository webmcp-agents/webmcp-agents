# Task 5.6: backend verification

Run on 2026-11-25 by the phase-5 session, against `@webmcp-agents/telemetry` as committed on
`feat/observability-chat-theming-testing-tooling`. One summary table, then the evidence per backend.

| Backend | Path | Result |
|---|---|---|
| Local OpenTelemetry Collector (`otel/opentelemetry-collector` 0.166.0, debug exporter) | env: `OTEL_EXPORTER_OTLP_ENDPOINT` | **Run, passed** over `http/json`, `http/protobuf` and `grpc`: one trace per turn, browser and server spans joined |
| LangSmith | env (`https://api.smith.langchain.com/otel`) | **Not run: no credential.** URL resolution checked offline |
| LangWatch | exporter instance (`LangWatchExporter` from `langwatch`) | **Not run: no credential.** Class accepted by the types |
| Langfuse | span processor (`LangfuseSpanProcessor` from `@langfuse/otel`) | **Not run: no credential.** Class accepted by the types |
| Sentry | global provider (`Sentry.init`) | **Not run: no credential.** Detection of Sentry's provider checked offline (see the finding below) |
| IBM Instana (agentless and host agent) | env (`OTEL_EXPORTER_OTLP_*`, `http/protobuf`) | **Not run: no credential, no host agent.** The generic OTLP path it uses is the one the Collector run verified |

The generic path ships for all of them: no vendor name, type or code path is in the package (a test,
`packages/telemetry/test/browser-entry.test.ts`, fails if one appears in its source).

## Local OpenTelemetry Collector (run)

**Setup.** Docker 29.8.2, `otel/opentelemetry-collector:latest` (0.166.0), OTLP receivers on 4318 (HTTP) and 4317
(gRPC), one `debug` exporter at `verbosity: detailed`:

```yaml
receivers:
  otlp:
    protocols:
      http: { endpoint: 0.0.0.0:4318 }
      grpc: { endpoint: 0.0.0.0:4317 }
exporters:
  debug: { verbosity: detailed }
service:
  pipelines:
    traces: { receivers: [otlp], exporters: [debug] }
```

```sh
docker run -d --rm --name wa-phase5-collector -p 4318:4318 -p 4317:4317 \
  -v "$PWD/config.yaml:/etc/otelcol/config.yaml:ro" otel/opentelemetry-collector:latest
```

**The turn.** A throwaway Vitest file in `packages/telemetry/test/` (deleted after the run) drove one turn through the
real code on both sides, once per protocol:

- the server: `defineObservability({ serviceName, env: { OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_PROTOCOL } })`
  on the real `createChatHandler`, two model steps (`mockModel([toolCall("add_to_cart"), text("Added.")])`), each
  request carrying `trace` (conversation, run, step 1 and 2) and the run's `traceparent`;
- the browser side: the real span builder (`createEngine`, what `observeAgents()` loads) fed the run's events
  (`run-start`, `tool-start` / `tool-finish`, `run-finish`), its OTLP JSON posted to the real
  `observability.relay()` (`202`), which forwarded the spans through the same layer;
- the page URL was `http://shop.local/checkout?token=secret-token`.

**What arrived** (from the Collector's debug output; ids as printed):

| Protocol | Trace ID | Span | Span ID | Parent ID |
|---|---|---|---|---|
| `http/json` | `a60ef7e2aa8f4d468850bb98114eb5a5` | `invoke_agent shopper` (browser, relayed) | `fe9d8faaf1304347` | none (root) |
| | | `execute_tool add_to_cart` (browser, relayed) | `00a18e3196d671c6` | `fe9d8faaf1304347` |
| | | `chat mock-model-id` (server, `webmcp.step` 1, Kind Client) | `10195301860af749` | `fe9d8faaf1304347` |
| | | `chat mock-model-id` (server, `webmcp.step` 2) | `e8b622313962bca2` | `fe9d8faaf1304347` |
| `http/protobuf` | `2294ad90ea904e259c13f266c7d1170c` | `invoke_agent shopper` | `80d3a0aab6254c4c` | none (root) |
| | | `execute_tool add_to_cart` | `c82562d05add0697` | `80d3a0aab6254c4c` |
| | | `chat mock-model-id` (step 1) | `fd4660a60d3ba163` | `80d3a0aab6254c4c` |
| | | `chat mock-model-id` (step 2) | `8594e933f02fa9bc` | `80d3a0aab6254c4c` |
| `grpc` | `4a71d1b3b39d449e9c128b2dccee464c` | `invoke_agent shopper` | `74dc6d8af9ad43b5` | none (root) |
| | | `execute_tool add_to_cart` | `ea3a91e3c9335abd` | `74dc6d8af9ad43b5` |
| | | `chat mock-model-id` (step 1) | `2ad8e41e7c616d84` | `74dc6d8af9ad43b5` |
| | | `chat mock-model-id` (step 2) | `28d6476022dc39dc` | `74dc6d8af9ad43b5` |

Per protocol: one trace, one root (the browser's run span, whose id is the run's `traceparent` span id), two `chat`
children and one `execute_tool` child: the span tree of design §7.5 and R-EXP-4's "one turn, one trace".

Also seen in the output:
- `InstrumentationScope @webmcp-agents/telemetry 0.4.0` on every span; resource `service.name` = the server's (the
  relay never trusts the browser's resource).
- `webmcp.page: Str(http://shop.local/checkout?token=[REDACTED])`: the query value redacted, origin and path kept.
- `chat` spans carry `webmcp.conversation.id`, `webmcp.run.id`, `webmcp.step`, `gen_ai.request.model`,
  `gen_ai.usage.input_tokens` / `output_tokens` and the AI SDK's other `gen_ai.*` attributes; no prompt or output
  (recording off).
- The AI SDK's own `invoke_agent` / `step` wrapper spans are absent, as designed when a browser parent exists.

**Teardown.** `docker stop wa-phase5-collector` (started with `--rm`: the container is gone); the throwaway test file
was deleted.

**How to run it again** (phase 6, or a reviewer): start the container as above, then point any app at it with
`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` (add `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, or `grpc` with
`http://localhost:4317`), run one chat turn, and read `docker logs wa-phase5-collector`.

## LangSmith (not run: no credential)

Path: env only (design §7.8), `OTEL_EXPORTER_OTLP_ENDPOINT=https://api.smith.langchain.com/otel` with
`OTEL_EXPORTER_OTLP_HEADERS=x-api-key=…,Langsmith-Project=…`. Checked offline: `resolveTarget` turns that base into
`https://api.smith.langchain.com/otel/v1/traces` (a test in `packages/telemetry/test/config.test.ts`), and headers in
that form are sent (`server.test.ts`, "OTEL_EXPORTER_OTLP_ENDPOINT: OTLP JSON posted to <base>/v1/traces with
OTEL_EXPORTER_OTLP_HEADERS"). Whether LangSmith's endpoint accepts OTLP **JSON** (this package's dependency-free
default) or needs `http/protobuf` is unverified: phase 6's recipe must check LangSmith's docs that day. Its grouping key
(`langsmith.trace.session_id`) works with `metadataMapping`: a mapping target is never redacted as a "session" key
(found and fixed in this phase).

## LangWatch (not run: no credential)

Path: an exporter instance. In a throwaway project outside the repo (`langwatch@2.3.0`, TypeScript 5.9.3), against the
package's built `dist/server.d.ts`: `LangWatchExporter` is assignable to this package's `SpanExporter`, and
`defineObservability({ exporters: [new LangWatchExporter()], conventions: "legacy" })` type-checks; a negative control
(`{ send() {} }` as a `SpanExporter`) fails as expected.

## Langfuse (not run: no credential)

Path: a span processor. Same throwaway project (`@langfuse/otel@6.1.1`): `LangfuseSpanProcessor` is assignable to
`SpanProcessor` and is accepted in `spanProcessors`. The OpenTelemetry SDK 2.x classes (`@opentelemetry/sdk-trace-base`
2.12.1 `InMemorySpanExporter`, `BatchSpanProcessor`) type-check too, so apps still on the 2.x SDK are covered. Note for
the recipe: a vendor processor that exports by itself sends what the AI SDK set, which this package already redacted
when the span was created.

## Sentry (not run: no credential)

Path: the global provider. Checked offline with `@sentry/node@11.17.0` in a plain Node script, a placeholder DSN on the
reserved `.invalid` domain and a no-op transport (nothing left the machine):

| `Sentry.init(…)` | Global tracer provider registered | `defineObservability().enabled` |
|---|---|---|
| no DSN | no | false |
| DSN, `tracesSampleRate: 1` | **no** | false |
| DSN, `tracesSampleRate: 1`, `enableOpenTelemetrySetup: true` | yes (`SentryTracerProvider`) | **true** |

**Finding for phase 6:** with Sentry 11, the design's "`Sentry.init(...)`; nothing else" recipe does not register an
OpenTelemetry provider unless `enableOpenTelemetrySetup: true` is set; with it, this package detects Sentry's provider
(without mistaking the API's no-op proxy for one) and uses it. The recipe page must say so after checking Sentry's
docs.

## IBM Instana (not run: no credential, no host agent)

Path: env only, `http/protobuf` (design §7.8.1). Nothing vendor-specific to check without a tenant or an agent. The
generic path it relies on was verified end to end above: `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` loads
`@opentelemetry/exporter-trace-otlp-proto` and delivered the turn to a Collector; headers from
`OTEL_EXPORTER_OTLP_HEADERS` (`x-instana-key`, `x-instana-host`) are sent as given; `resourceAttributes` (for
`faas.id` / `host.id`) reach the resource. Still to confirm on a real tenant (phase 6, open question 5): `http/json`
acceptance, the identity requirement on serverless, and which attributes its GenAI views read.
