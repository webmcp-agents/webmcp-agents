---
description: "observeAgents() as one React element: observes while mounted, reads the latest consent at each run."
---

# `<ObserveAgents>`

Renders nothing and observes the page's agent runs while it is mounted ([`observeAgents`](./observe-agents.md)), stopping (and sending what is buffered) when it unmounts. Put it inside your provider, next to the app.

Experimental: new in 0.5.0.

## Import

```ts
import { ObserveAgents } from "@webmcp-agents/telemetry/react";
import type { ObserveAgentsProps } from "@webmcp-agents/telemetry/react";
```

## Example

```tsx
<WebAgentsProvider>
  <ObserveAgents enabled={() => consent.analytics} />
  <App />
</WebAgentsProvider>
```

## Props

The options of [`observeAgents`](./observe-agents.md#options) (`ObserveAgentsProps` is `ObserveAgentsOptions`).

| Name | Type | Default | Description |
|---|---|---|---|
| `enabled` | `() => boolean` | `() => true` | Consent. Read at each run's start from the latest props, so an inline function is fine. |
| `exporters`, `tracerProvider`, `serviceName`, `sampling`, `recordInputs`, `recordOutputs`, `redact`, `spanFilter`, `metadataMapping`, `batchMs`, `batchSize` | see `observeAgents` | see `observeAgents` | Read once, when it mounts. |

## Returns

`null`.

## See also

- [`observeAgents`](./observe-agents.md)
- [`observability.relay`](./relay.md)
