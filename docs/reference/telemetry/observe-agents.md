---
description: "Sends the page's agent runs as OpenTelemetry spans: a run, each tool call, on-device steps, to the app's relay or the page's own provider."
---

# `observeAgents`

Turns the page's agent runs into OpenTelemetry spans: each run is an `invoke_agent` span, each tool call an `execute_tool` span (with the person's confirmation, the time they took, and the cursor yielding to them), a sub-agent's run a child of its delegating call, and an on-device run's model steps `chat` spans. A run's span has the ids its step requests carry, so the server's `chat` spans join the same trace. By default spans go to the app's relay at `/api/telemetry` ([`observability.relay()`](./relay.md)); a page that already runs OpenTelemetry gets them in its own provider.

Experimental: new in 0.5.0.

## Import

```ts
import { observeAgents } from "@webmcp-agents/telemetry";
import type { BrowserSpanExporter, ObserveAgentsOptions, SpanRecord, StopObserving } from "@webmcp-agents/telemetry";
```

## Example

Observe only once the person agreed to analytics:

```ts
const stop = observeAgents({ enabled: () => consent.analytics });
```

## Options

`observeAgents(options?)` takes an `ObserveAgentsOptions`; every field is optional.

| Name | Type | Default | Description |
|---|---|---|---|
| `exporters` | `readonly (string \| OtlpTarget \| BrowserSpanExporter)[]` | the page's provider, else `"/api/telemetry"` | Where spans go: a relay URL, an OTLP target (`http/json`, posted from the page: its headers are public), or any object with `export(spans)`. `[]` builds no span and sends nothing. |
| `tracerProvider` | `TracerProvider \| "global" \| "own"` | the page's registered one | A provider to use as is, `"global"` to require the page's (off, with one error, when there is none), or `"own"` never to use it. |
| `serviceName` | `string` | `location.host` | `service.name` of the spans (the relay replaces the resource with the server's). |
| `sampling` | `Sampling` | `{ type: "always" }` | Which runs are exported, decided at each run's start. |
| `recordInputs` | `boolean` | `false` | Put tool inputs on `execute_tool` spans (`gen_ai.tool.call.arguments`), redacted. |
| `recordOutputs` | `boolean` | `false` | Put tool results on them (`gen_ai.tool.call.result`), redacted. |
| `redact` | `false \| RedactOptions \| Redactor` | the page's redactor | What every span passes through ([`configureRedaction`](../core/configure-redaction.md), read at each use). `false` only for local debugging. |
| `enabled` | `() => boolean` | `() => true` | Consent, read when each run starts: `false` (or a throw) and that run produces no span and no request. |
| `spanFilter` | `(span: SpanRecord) => boolean` | none | Keep (true) or drop (false) a span, after redaction; a throw drops it. |
| `metadataMapping` | `Record<string, string>` | none | Copy an attribute to the name a backend groups by. Runs before redaction. |
| `batchMs` | `number` | `2000` | Send at most this often. |
| `batchSize` | `number` | `64` | Send sooner once this many spans wait. |

### `SpanRecord`

What a `spanFilter` and a `BrowserSpanExporter` receive, already redacted.

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | `invoke_agent <agent>`, `execute_tool <tool>` or `chat <model>`. |
| `traceId` | `string` | required | 32 hex digits: the run's trace, shared with the server's spans of the run. |
| `spanId` | `string` | required | 16 hex digits. A run span's id is its `traceparent`'s, so the server's step spans are its children. |
| `parentSpanId` | `string` | not set on a root | The run, for a call or a step; the delegating call, for a sub-agent's run. |
| `startTime` | `number` | required | Milliseconds since the epoch. |
| `endTime` | `number` | required | Milliseconds since the epoch. |
| `attributes` | `Attributes` | required | See [the span names and attributes](./semconv.md). |
| `events` | `{ name, time, attributes? }[]` | `[]` | `webmcp.park`, `webmcp.yield`, `webmcp.resume`. |
| `status` | `{ code: "unset" \| "ok" \| "error"; message? }` | `unset` | `error` for a failed run or call. |

## Returns

A `StopObserving`: call it to stop (buffered spans are sent first; no later run is observed). Its `flush()` sends what is buffered now and resolves once the exporters took it; it never rejects.

## Notes

- **What loads.** Up front, only the subscription (about 0.7 KB min+gz). The span builder (about 3.6 KB) loads when the first run the person consented to starts; a page where no run happens, or where consent is never given, never downloads it. The bridge to a page's own provider and `@opentelemetry/api` load only on a page that registered one.
- **Leaving the page.** Spans still buffered are sent when the page is hidden or unloaded (`keepalive`).
- **No relay.** A relay that answers `404` or `405` is taken as absent: nothing more is sent.
- **The page's own provider** makes its own span ids, so each span is created when it ends, its parent first; the run span is placed under its `traceparent`, in the run's trace, beside the server's step spans.
- **Content** is left out unless you record it, and is redacted either way: the run events it comes from are redacted too ([`onAgentRun`](../chat/on-agent-run.md)).

## See also

- [`<ObserveAgents>`](./observe-agents-component.md), the same in React
- [`observability.relay`](./relay.md), where spans go by default
- [`consoleExporter`](./console-exporter.md)
- [The span names and attributes](./semconv.md)
