---
description: "The endpoint for the browser's spans: same-site only, size-capped, this package's spans only, redacted again, sampled by the server, answered 202."
---

# `observability.relay`

Builds the `POST` handler that accepts the spans [`observeAgents`](./observe-agents.md) sends from the page and forwards them through the same layer as the server's spans, so they reach the same exporters (or the app's own provider) and no backend key ever reaches the browser. The browser is not trusted: the relay refuses cross-site requests, caps the body, accepts only OTLP JSON from this package's instrumentation scope, redacts every value again, and lets the server's sampling decide.

Experimental: new in 0.5.0.

## Import

```ts
import { defineObservability } from "@webmcp-agents/telemetry/server";
import type { TelemetryRelayOptions } from "@webmcp-agents/telemetry/server";
```

## Example

The page posts to `/api/telemetry` by default:

```ts app/api/telemetry/route.ts
import { observability } from "@/lib/observability";

export const POST = observability.relay();
```

## Options

`observability.relay(options?)` takes a `TelemetryRelayOptions`.

| Name | Type | Default | Description |
|---|---|---|---|
| `guard` | `(req: Request) => Response \| undefined \| Promise<…>` | none | Runs first, after the cross-site check: return a `Response` to refuse (a rate limit, a session check); it is sent as is. A throw refuses with `500`. |
| `maxBytes` | `number` | `262144` (256 KB, `RELAY_MAX_BYTES`) | The largest body accepted; larger is `413`. |
| `attributes` | `(req: Request) => Record<string, string>` | none | Resource attributes added on the server (a release, a region). The browser's own resource is never trusted. |

## Returns

`(req: Request, ...host) => Promise<Response>`. Every answer has no body:

| Status | When |
|---|---|
| `202` | Accepted: forwarded, or dropped because telemetry is off (`OTEL_SDK_DISABLED`), the server's sampling said no, or the backend failed. Nothing about an upstream error is revealed. |
| `400` | Not JSON, not OTLP JSON, a malformed id or time, or spans from another instrumentation scope. |
| `403` | A cross-site request (an `Origin` that is not the endpoint's own). |
| `405` | Not a `POST`. |
| `413` | Over `maxBytes`. |
| `415` | A content type other than `application/json`. |
| `500` | The `guard` threw. |

## Notes

- **The same pipeline.** With a provider this package builds, relayed spans keep the browser's ids (so the server's step spans are their children) and pass through your `spanProcessors`, the mapping, redaction and the filter. Through an app's provider, which makes its own span ids, a relayed span is created with its recorded times, parents first, in the browser's trace; the server-side `attributes` are then set on each span.
- **Serverless.** An argument after the request with `waitUntil` (a Worker's `ctx`), or Vercel's request context, keeps the function alive until the batch is sent; the `202` never waits for it.
- Mount it behind the same origin and rate limits as the chat (see [`createVercelTelemetryRoute`](../vercel-api/create-vercel-telemetry-route.md)).

## See also

- [`observeAgents`](./observe-agents.md), what sends to it
- [`defineObservability`](./define-observability.md)
- [`isCrossSite`](../chat/chat-request-schema.md), the cross-site rule it shares with the chat
