---
description: "An OTLP destination for defineObservability: a base or an exact URL, a protocol, headers and a timeout, with the OTEL_* env filling what is left out."
---

# `otlp`

Describes one OTLP destination for [`defineObservability`](./define-observability.md)'s `exporters`. Give a base `endpoint` (`/v1/traces` is appended) or exact `endpoints.traces` (used as given, query string and tenant path included), never both. What a target leaves out falls back to the `OTEL_EXPORTER_OTLP_*` variables when the layer is set up, so `otlp()` alone means "whatever the env says".

Experimental: new in 0.5.0.

## Import

```ts
import { otlp } from "@webmcp-agents/telemetry/server";
import type { OtlpTarget } from "@webmcp-agents/telemetry/server";
```

## Example

Two destinations, each with its own URL and headers (prefer one Collector that fans out over several exporters in a function):

```ts
defineObservability({
  exporters: [
    otlp({ endpoint: "https://otel.example.com", headers: { "x-api-key": process.env.OTEL_KEY! } }),
    otlp({ endpoints: { traces: "https://traces.example.com/ingest?tenant=acme" } }),
  ],
});
```

## Options

`otlp(target?)` takes an `OtlpTarget`.

| Name | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | `OTEL_EXPORTER_OTLP_ENDPOINT` | The base URL; `/v1/traces` is appended (for `grpc`, used as given). Not with `endpoints`. |
| `endpoints` | `{ traces: string }` | `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | The exact URL, used as given. Not with `endpoint`. |
| `protocol` | `"http/json" \| "http/protobuf" \| "grpc"` | `OTEL_EXPORTER_OTLP_PROTOCOL`, else `"http/json"` | `http/json` needs nothing (it runs on the edge); `http/protobuf` loads `@opentelemetry/exporter-trace-otlp-proto`, `grpc` loads `@opentelemetry/exporter-trace-otlp-grpc`. |
| `headers` | `Record<string, string>` | none | Sent with every export, merged over `OTEL_EXPORTER_OTLP_HEADERS`. Server side only. |
| `timeout` | `number` | `OTEL_EXPORTER_OTLP_TIMEOUT`, else `30000` | How long one export may take, in ms, before it is dropped. |

## Returns

The `OtlpTarget`, as given (copied).

## Notes

- `endpoint` and `endpoints` together are a type error; at run time that target is off with an error, and the other targets still export.
- A protocol whose package is not installed turns that target off with one error naming the package to install.
- In the browser, [`observeAgents`](./observe-agents.md) takes an OTLP target too, `http/json` only, with no env to fall back on: whatever headers it carries are in the page.

## See also

- [`defineObservability`](./define-observability.md)
- [`resolveTarget`](./resolve-target.md), what the env alone resolves to
