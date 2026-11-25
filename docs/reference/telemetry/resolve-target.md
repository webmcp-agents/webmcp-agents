---
description: "Where the OTEL_* environment alone sends spans: the URL, or off."
---

# `resolveTarget`

Answers where an OTLP target goes once the standard environment variables fill it in: the exact URL, or `"off"`. Use it in a health check or a startup log to see what a deployment's env resolves to, without sending anything.

Experimental: new in 0.5.0.

## Import

```ts
import { resolveTarget } from "@webmcp-agents/telemetry/server";
```

## Example

```ts
resolveTarget({}, process.env); // "https://otel.example.com/v1/traces", or "off"
```

## Options

`resolveTarget(target, env)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `target` | `OtlpTarget` | required | A target ([`otlp`](./otlp.md)); `{}` for the env alone. |
| `env` | `Record<string, string \| undefined>` | required | The variables, e.g. `process.env`. |

## Returns

A `string`: the URL spans are posted to, or `"off"` when there is no endpoint, a kill switch is set (`OTEL_SDK_DISABLED=true`, `WEB_AGENTS_OTEL_ENABLED=false`), or the target cannot be used (both endpoint forms, an unknown protocol, an invalid URL).

| Env | Result |
|---|---|
| none | `"off"` |
| `OTEL_EXPORTER_OTLP_ENDPOINT=https://c.example` | `https://c.example/v1/traces` |
| the above and `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://t.example/x?y=1` | `https://t.example/x?y=1` |
| the above and `OTEL_SDK_DISABLED=true` | `"off"` |

## See also

- [`defineObservability`](./define-observability.md#environment-variables), every variable
