---
slug: reference/telemetry
description: "@webmcp-agents/telemetry sends agent runs to any OpenTelemetry backend. Each API has one page, in Observability: this is the index."
---

# `@webmcp-agents/telemetry`

`@webmcp-agents/telemetry` sends what your agents do to any backend that speaks OpenTelemetry: every model step from
the chat handler, and each run and tool call from the page, through your own relay. Each API is documented once, on
its page in [Observability](../../observability/index.mdx), where the options come from the source and the backend you
picked carries from page to page. Start with [Installation](../../observability/installation/index.mdx).

Experimental: new in 0.5.0. Span and attribute names follow the OpenTelemetry GenAI conventions, which are not stable
yet.

```sh
pnpm add @webmcp-agents/telemetry @opentelemetry/api @opentelemetry/sdk-trace @ai-sdk/otel
```

The three OpenTelemetry packages are optional peers, loaded on the first request: without them the layer is off and
says which to install.

## `@webmcp-agents/telemetry/server`

- [`defineObservability`](../../observability/define-observability.mdx): the layer the chat handler takes as
  `observability`.
- [`otlp`](../../observability/otlp.mdx): one OTLP destination in code.
- [`observability.relay`](../../observability/relay.mdx): the `/api/telemetry` handler for the page's spans.
- [`observability.event`, `observability.span`](../../observability/custom-events.mdx): your own events and spans
  in a chat request's trace.
- [`resolveTarget`](../../observability/where-spans-go.mdx#check-a-deployment-resolvetarget): what the environment
  resolves to, without sending anything.

## `@webmcp-agents/telemetry`

- [`observeAgents`](../../observability/observe-agents.mdx): the page's runs and tool calls as spans.
- [`recordAgentEvent`, `withAgentSpan`](../../observability/custom-events.mdx): your own events and spans in a
  run's trace.
- [`consoleExporter`](../../observability/observe-agents.mdx#returns): print spans instead of sending them.

## `@webmcp-agents/telemetry/react`

- [`<ObserveAgents>`](../../observability/observe-agents.mdx): `observeAgents` as a component.

## Both entries

- [Span names and attributes](../../observability/spans.mdx#names): every name as a constant.
- [The OpenTelemetry types](../../observability/spans.mdx#types): the shapes the options take.

## See also

- [`createChatHandler`](../chat/create-chat-handler.md#telemetry): the handler's own `telemetry` option and the
  `ChatObservability` interface this package implements
- [`onAgentRun`](../chat/on-agent-run.md): the run events the browser spans are built from
- [`configureRedaction`](../core/configure-redaction.md): the redactor every span passes through
- [Testing spans](../testing/telemetry.md): `memoryExporter`, `toHaveSpan`, `toBeOneTrace`
