# @webmcp-agents/testing

## 0.5.0

### Minor Changes

- [#9](https://github.com/webmcp-agents/webmcp-agents/pull/9) [`9c79b78`](https://github.com/webmcp-agents/webmcp-agents/commit/9c79b78b7d20ae70527dfce61d2e9ab2d335969a) Thanks [@mustafaskyer](https://github.com/mustafaskyer)! - **Behavior change:** sensitive fields are now masked where the library shows or logs a tool call. Password-like controls, fields with `autocomplete` of a card or one-time code, anything marked `data-agent-sensitive`, and a tool's `sensitive` parameters appear as masked values in the cursor's `fill` events, the devtools log and the chat's tool card. The URLs sent with chat requests have their query values redacted. The model still receives tool inputs and results as before, unless a tool sets `hideFromModel`.
  
  New in this release:
  
  - **Redaction.** `@webmcp-agents/core/redact` is one redactor per page and per server, on by default. Mark data with `defineWebTool({ sensitive })`, a schema's `x-sensitive` or `format: "password"`, or a control's `data-agent-sensitive`; add rules with `<WebAgentsProvider redact>`, `configureRedaction` or `createChatHandler({ redact })`.
  - **Testing kit.** The new `@webmcp-agents/testing` package gives Vitest fixtures, matchers and mocks for tools, agents, the chat, the chat endpoint, telemetry and end-to-end runs, with a Playwright entry that drives a page's tools.
  - **Chat customization.** `<AgentChat>` takes a `theme` (light and dark, or one), `messages`, `locale`, `classNames`, `styles`, replaceable `components` and `unstyled`. Arabic and Spanish ship as `@webmcp-agents/chat/locales/ar` and `/es`, and Arabic lays the chat out right to left. Every visual value is a `--wa-chat-*` variable and every part has a `data-wa-part`.
  - **Run telemetry in the chat.** Chat requests carry run, step and tool ids and a `traceparent`, `onAgentRun` reports each run in the browser, and the chat handler accepts `telemetry` and `observability` options.
  - **OpenTelemetry export.** The new `@webmcp-agents/telemetry` package sends a run's spans to any OpenTelemetry backend: `defineObservability()` on the server (the standard `OTEL_*` variables decide where, and nothing is sent when they are not set), `observeAgents()` or `<ObserveAgents>` in the browser through a relay route, and a Collector recipe plus sixteen backend recipes in the docs.

### Patch Changes

- Updated dependencies [[`9c79b78`](https://github.com/webmcp-agents/webmcp-agents/commit/9c79b78b7d20ae70527dfce61d2e9ab2d335969a)]:
  - @webmcp-agents/core@0.5.0
  - @webmcp-agents/chat@0.5.0
  - @webmcp-agents/telemetry@0.5.0
