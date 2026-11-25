---
description: "The /api/telemetry relay for a Vercel Function: the browser's spans behind the origin rule and a per-IP limit, through the instance's one observability layer."
---

# `createVercelTelemetryRoute`

Builds the `/api/telemetry` handler for a Vercel Function: [`observability.relay()`](../telemetry/relay.md) behind the same origin rule as the chat and a per-IP limit, through one observability layer per function instance (`observabilityFor(env)`), which [`createVercelChatRoute`](./create-vercel-chat-route.md) passes to the chat handler too. Telemetry is off unless the deployment sets the standard `OTEL_*` variables: the relay then accepts and drops. The package is private and not published to npm.

## Import

```ts
import { createVercelTelemetryRoute, observabilityFor } from "@webmcp-agents/vercel-api";
import type { VercelTelemetryRouteOptions } from "@webmcp-agents/vercel-api";
```

## Example

```ts examples/ecommerce/api/telemetry.ts
import { createVercelTelemetryRoute } from "@webmcp-agents/vercel-api";

export const { POST } = createVercelTelemetryRoute({ app: "ecommerce" });
```

## Options

`createVercelTelemetryRoute(options)` takes a `VercelTelemetryRouteOptions`.

| Name | Type | Default | Description |
|---|---|---|---|
| `app` | `string` | required | Namespaces the rate-limit keys (`<app>:telemetry`): the same name as the app's chat route. |
| `env` | `Env` | `process.env` | Where the variables are read; also the key of the instance's shared layer. |
| `observability` | `Observability` | `observabilityFor(env)` | A layer to relay through instead of the shared one. |

### Environment variables

| Name | Type | Default | Description |
|---|---|---|---|
| `RATE_LIMIT_TELEMETRY_PER_MINUTE` | number | `60` | Relay requests per IP per minute (a page sends at most one batch every 2 s). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` and the rest | text | none | Where spans go: see [`defineObservability`](../telemetry/define-observability.md#environment-variables). Unset: off. |

## Returns

`{ POST }`: `202` with no body for accepted spans (forwarded, or dropped while telemetry is off), `403` without this deployment's `Origin`, `429` past the limit, and the relay's other refusals.

## Notes

- `observabilityFor(env)` returns the same layer for the same `env` object, so the chat's step spans and the relayed browser spans share one exporter and one batch per instance. Each route hands the flush to Vercel's `waitUntil`.
- Nothing loads until a request needs it; the OpenTelemetry packages come with `@webmcp-agents/telemetry`'s optional peers.

## See also

- [`createVercelChatRoute`](./create-vercel-chat-route.md)
- [`observability.relay`](../telemetry/relay.md)
- [Deploy](../../more/deploy.md)
