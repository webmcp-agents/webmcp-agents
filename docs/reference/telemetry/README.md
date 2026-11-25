---
slug: reference/telemetry
description: "@webmcp-agents/telemetry sends agent runs to any OpenTelemetry backend: model steps from the chat handler, runs and tool calls from the browser through a relay, with standard OTEL_* env and redaction on by default."
---

# `@webmcp-agents/telemetry`

`@webmcp-agents/telemetry` sends what your agents do to any backend that speaks OpenTelemetry. On the server, one line on the chat handler exports every model step; in the browser, one call exports each run and each tool call, through your own relay endpoint, so no backend key reaches the page. Both sides land in the same trace. Where spans go is the standard `OTEL_*` environment, or any OpenTelemetry exporter, processor or tracer provider you pass as is: there is no vendor code in this package, and a backend is a recipe.

Experimental: new in 0.5.0. Span and attribute names follow the OpenTelemetry GenAI conventions, which are not stable yet.

```sh
pnpm add @webmcp-agents/telemetry @opentelemetry/api @opentelemetry/sdk-trace @ai-sdk/otel
```

The three OpenTelemetry packages are optional peers, loaded on the first request: without them the layer is off and says which to install. `@opentelemetry/sdk-trace` is not needed when the app already registers a tracer provider; `@opentelemetry/exporter-trace-otlp-proto` (or `-grpc`) only for those protocols. The browser side needs none of them.

## Entries

| Entry | Where | Contents |
|---|---|---|
| `@webmcp-agents/telemetry/server` | the chat handler, the relay | [`defineObservability`](./define-observability.md), [`otlp`](./otlp.md), [`observability.relay`](./relay.md), [`resolveTarget`](./resolve-target.md) |
| `@webmcp-agents/telemetry` | the page | [`observeAgents`](./observe-agents.md), [`consoleExporter`](./console-exporter.md) |
| `@webmcp-agents/telemetry/react` | the page, React | [`<ObserveAgents>`](./observe-agents-component.md) |
| both | names and types | [the span names and attributes](./semconv.md), [the OpenTelemetry types](./types.md) |

## The pieces together

- The chat handler gets [`defineObservability()`](./define-observability.md) as its `observability` option. Every model step is a `chat <model>` span with the run's ids.
- The page calls [`observeAgents()`](./observe-agents.md) (or renders [`<ObserveAgents>`](./observe-agents-component.md)). Each run is an `invoke_agent` span and each tool call an `execute_tool` span, posted to `/api/telemetry`.
- `/api/telemetry` is [`observability.relay()`](./relay.md): it checks and redacts what the page sent, then forwards it through the same layer.
- The browser's run span and the server's step spans share ids through the `traceparent` the chat sends with every step ([`onAgentRun`](../chat/on-agent-run.md) has them), so a backend shows one trace per turn.

## See also

- [Observability](../../observability/index.mdx): the guide, and a recipe per backend
- [`createChatHandler`](../chat/create-chat-handler.md#telemetry): the handler's own `telemetry` option and the `ChatObservability` interface this package implements
- [`onAgentRun`](../chat/on-agent-run.md): the run events the browser spans are built from
- [`configureRedaction`](../core/configure-redaction.md): the redactor every span passes through
- [Testing spans](../testing/telemetry.md): `memoryExporter`, `toHaveSpan`, `toBeOneTrace`
