---
description: "The OpenTelemetry shapes this package accepts: any SpanExporter, SpanProcessor or TracerProvider, as is, and Sampling."
---

# OpenTelemetry types

The types the options take. They are structural on purpose: any `SpanExporter`, `SpanProcessor` or `TracerProvider` from the OpenTelemetry SDK, or from a vendor's package built on it, fits them as is, and this package's public types import nothing from `@opentelemetry/*`. Adding a backend never needs a change here.

Experimental: new in 0.5.0.

## Import

```ts
import type { OtlpTarget, ReadableSpanLike, Sampling, SpanExporter, SpanProcessor, TracerProvider } from "@webmcp-agents/telemetry/server";
```

## Example

A vendor's processor and an in-memory exporter, passed as they come:

```ts
defineObservability({ spanProcessors: [new VendorSpanProcessor()], exporters: [new InMemorySpanExporter()] });
```

## Options

| Name | Type | Default | Description |
|---|---|---|---|
| `SpanExporter` | `{ export(spans, done), shutdown(), forceFlush?() }` | — | Any OpenTelemetry span exporter. Its `export` is capped by the target timeout; a throw, a failure result or a hang drops that batch for it alone, logged once. |
| `SpanProcessor` | `{ onStart, onEnd, forceFlush, shutdown }` | — | Any OpenTelemetry span processor. Runs before the mapping, redaction and the filter. |
| `TracerProvider` | `{ getTracer(name, version?) }` | — | Any OpenTelemetry tracer provider. Used as is; never shut down by this package. |
| `TracerProviderOption` | `TracerProvider \| "global" \| "own"` | — | The `tracerProvider` option. |
| `ReadableSpanLike` | `{ name, kind, spanContext(), parentSpanContext?, startTime, endTime, status, attributes, events, instrumentationScope, resource }` | — | A finished span, as a `spanFilter` reads it. A real `ReadableSpan` has these fields and more. |
| `Sampling` | `{ type: "always" } \| { type: "never" } \| { type: "ratio"; probability } \| { type: "custom"; sampler(ctx) }` | `always` | `ratio` decides by trace id, so a trace is kept or dropped whole on both sides; `custom` gets a `SamplingContext` (`agent`, `conversation`, `request`) and drops the trace when it throws. |
| `OtlpTarget` | see [`otlp`](./otlp.md) | — | An OTLP destination. |
| `Attributes`, `AttributeValue` | `Record<string, string \| number \| boolean \| array>` | — | Span attributes. |

## See also

- [`defineObservability`](./define-observability.md)
- [`observeAgents`](./observe-agents.md)
