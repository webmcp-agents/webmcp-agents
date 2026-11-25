---
description: "The chat handler's observability layer: every model step as an OpenTelemetry span, sent where the OTEL_* env, your exporters or the app's own provider say."
---

# `defineObservability`

Creates the layer you pass to [`createChatHandler`](../chat/create-chat-handler.md#telemetry) as `observability`. Every model step becomes a `chat <model>` span carrying the run's ids, a child of the browser's run span when the page observes its runs. Where spans go is decided once, on the first request, first match wins: a `tracerProvider` you pass, then `exporters` / `spanProcessors`, then a tracer provider the app registered (an OpenTelemetry SDK setup), then `OTEL_EXPORTER_OTLP_ENDPOINT`, else off. It never registers anything globally and never shuts down a provider it did not build.

Experimental: new in 0.5.0.

## Import

```ts
import { defineObservability } from "@webmcp-agents/telemetry/server";
import type { Observability, ObservabilityConfig } from "@webmcp-agents/telemetry/server";
```

## Example

One line on the handler; everything else is environment.

```ts app/api/chat/route.ts
import { createChatHandler } from "@webmcp-agents/chat/server";
import { defineObservability } from "@webmcp-agents/telemetry/server";

export const observability = defineObservability();
export const POST = createChatHandler({ agents, observability });
```

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com
OTEL_EXPORTER_OTLP_HEADERS=x-api-key=…
```

## Options

`defineObservability(config?)` takes an `ObservabilityConfig`; every field is optional.

| Name | Type | Default | Description |
|---|---|---|---|
| `serviceName` | `string` | `OTEL_SERVICE_NAME`, else `"web-agents"` | `service.name` of every span. |
| `resourceAttributes` | `Record<string, string>` | none | Resource attributes (a release, a region), merged over `OTEL_RESOURCE_ATTRIBUTES`; the option wins. |
| `exporters` | `readonly (OtlpTarget \| SpanExporter)[]` | the env's one target | OTLP targets ([`otlp()`](./otlp.md)) and any OpenTelemetry `SpanExporter` instance, used as is. Giving any builds a private provider. |
| `spanProcessors` | `readonly SpanProcessor[]` | none | Any OpenTelemetry `SpanProcessor` (a vendor's, or yours), as is. They run first, before the mapping, redaction and filter. |
| `tracerProvider` | `TracerProvider \| "global" \| "own"` | the app's registered one, when there is one | A provider to use as is (its pipeline is the app's), `"global"` to require the app's (off, with one error, when there is none), or `"own"` never to use it. |
| `sampling` | `Sampling` | `OTEL_TRACES_SAMPLER`, else `{ type: "always" }` | Which requests are exported: `always`, `never`, `ratio` (by trace id, so a trace is kept whole) or `custom` (gets the agent, the conversation and the request). |
| `conventions` | `"genai" \| "legacy" \| "both"` | `"genai"` | The model spans' attribute style: `gen_ai.*`, the AI SDK's `ai.*` (what some backends read), or both, each from its own tracer. |
| `recordInputs` | `boolean` | `false` | Record prompts and tool definitions on model spans, redacted. The handler's own `telemetry.recordInputs` wins. |
| `recordOutputs` | `boolean` | `false` | Record the model's output, redacted. The handler's own `telemetry.recordOutputs` wins. |
| `redact` | `false \| RedactOptions \| Redactor` | the process's redactor | What every exported value passes through ([`configureRedaction`](../core/configure-redaction.md), read at each use). `false` only for local debugging. |
| `metadataMapping` | `Record<string, string>` | none | Copy an attribute to the name a backend groups by, e.g. `{ "webmcp.conversation.id": "session.id" }`. Runs before redaction; a target named here is never treated as a secret key. |
| `spanFilter` | `(span: ReadableSpanLike) => boolean` | none | Keep (true) or drop (false) a span; a throw drops it. Runs last on a provider this package builds; through an app's provider, when the span starts. |
| `batchSize` | `number` | `512` | Spans per export. |
| `debug` | `boolean` | `WEB_AGENTS_OTEL_DEBUG === "true"` | Also print each exported span to the console, redacted. |
| `env` | `Record<string, string \| undefined>` | `process.env` | Where the variables below are read. |

### Environment variables

| Name | Type | Default | Description |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | URL | none | The base URL; `/v1/traces` is appended (for `grpc`, used as given). |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | URL | none | The exact URL, used as given; wins over the base. |
| `OTEL_EXPORTER_OTLP_HEADERS`, `…_TRACES_HEADERS` | `k=v,k2=v2` | none | Headers, percent-decoded. An entry with no `=` is skipped and logged once. |
| `OTEL_EXPORTER_OTLP_PROTOCOL`, `…_TRACES_PROTOCOL` | `http/json \| http/protobuf \| grpc` | `http/json` | Anything else turns telemetry off with one error. |
| `OTEL_EXPORTER_OTLP_TIMEOUT`, `…_TRACES_TIMEOUT` | ms | `30000` | How long one export may take. |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | text | none | The resource. |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG` | `always_on \| always_off \| traceidratio` | `always_on` | `parentbased_*` forms read the same: the server decides, not the browser's flag. |
| `OTEL_SDK_DISABLED` | `true` | none | Everything off; the relay accepts and drops. |
| `WEB_AGENTS_OTEL_ENABLED` | `false` | none | Only this package off; the app's own spans are unaffected. |
| `WEB_AGENTS_OTEL_DEBUG` | `true` | none | The `debug` option. |

## Returns

An `Observability`: the handler's `ChatObservability` (`telemetry`, `withContext`, `flush`, `exportTimeoutMs`), plus `enabled` (false when the configuration resolves to off, or once setting it up failed), [`relay(options?)`](./relay.md) and `shutdown()` (sends what is buffered and shuts down a provider this package built; an app's own provider is only flushed). `flush()` and `shutdown()` never reject.

## Notes

- **Nothing loads at import.** The OpenTelemetry packages are loaded on the first request. A missing one, bad env, both endpoint forms on a target, an unknown protocol, a throwing or hanging exporter, an unreachable backend: each is logged once (redacted), turns off only what it affects, and never changes a chat request's answer or timing.
- **Content is off by default.** Only ids, timings, the model and token counts are exported until you turn recording on; then values still pass through the redactor, last, after your processors and the mapping.
- **Through an app's provider**, this package cannot own the pipeline: it redacts every attribute it sets before the span exists. What the app's own processors add is theirs to handle.
- **The span tree.** When the request carries the page's `traceparent`, the AI SDK's own `invoke_agent` and `step` wrapper spans are left out, so each `chat` span is a direct child of the browser's run span. Without it (a page that does not observe its runs, a 0.4.0 page), the AI SDK's tree is exported as is.
- **The app's AI SDK integrations stay.** Integrations the app registered with `registerTelemetry` are passed along with this package's for each call (`ai@7` replaces registered ones with per-call ones otherwise).
- **Serverless.** The handler hands `flush()` to the host's `waitUntil` when it finds one (Vercel, Workers); a Vercel app keeps one layer per function instance (see [`createVercelTelemetryRoute`](../vercel-api/create-vercel-telemetry-route.md)).

## See also

- [`otlp`](./otlp.md), an explicit OTLP target
- [`observability.relay`](./relay.md), the browser's spans
- [The span names and attributes](./semconv.md)
- [`createChatHandler`](../chat/create-chat-handler.md#telemetry), its `telemetry` and `observability` options
