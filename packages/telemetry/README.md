# @webmcp-agents/telemetry

Send what your agents do to any OpenTelemetry backend. The chat handler exports every model step; the page exports each
run and tool call through your own relay endpoint, so no backend key reaches the browser; both land in one trace per
turn. Where spans go is the standard `OTEL_*` environment, or any OpenTelemetry exporter, processor or tracer provider
you pass as is: no vendor code here, and an app's own OpenTelemetry setup is used, never replaced. Content stays out
until you ask for it, and everything is redacted. **Experimental in 0.5.0.**

```sh
pnpm add @webmcp-agents/telemetry @opentelemetry/api @opentelemetry/sdk-trace @ai-sdk/otel
```

```ts
// app/api/chat/route.ts: the server, one line; OTEL_EXPORTER_OTLP_ENDPOINT / _HEADERS say where
import { defineObservability } from "@webmcp-agents/telemetry/server";
export const observability = defineObservability();
export const POST = createChatHandler({ agents, observability });

// app/api/telemetry/route.ts: the relay for the browser's spans
export const POST = observability.relay();
```

```tsx
// the page: each run and tool call, sent to /api/telemetry once the person agreed
import { ObserveAgents } from "@webmcp-agents/telemetry/react";
<ObserveAgents enabled={() => consent.analytics} />;
```

| Entry | Contents |
|---|---|
| `@webmcp-agents/telemetry/server` | `defineObservability`, `otlp`, `observability.relay()`, `resolveTarget`, the span names |
| `@webmcp-agents/telemetry` | `observeAgents`, `consoleExporter`, the span names (about 0.7 KB up front; the span builder loads at the first consented run) |
| `@webmcp-agents/telemetry/react` | `<ObserveAgents>` |

The OpenTelemetry packages are optional peers, loaded on the first request: without them the layer is off and says
which to install. A missing package, bad env, a failing exporter or an unreachable backend is logged once and never
changes a chat request.

Docs: [webmcp-agents.dev/docs/reference/telemetry](https://webmcp-agents.dev/docs/reference/telemetry).
