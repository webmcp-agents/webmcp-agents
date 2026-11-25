---
slug: reference/testing
description: "@webmcp-agents/testing tests WebMCP tools, confirmations, agents, the chat endpoint and privacy with Vitest: fixtures, worded matchers and model-free mocks."
---

# `@webmcp-agents/testing`

`@webmcp-agents/testing` tests what this library builds, with Vitest and nothing hand-written: a tool in Node, a tool on the page with the cursor and a confirmation, an agent without a model, the `/api/chat` endpoint without a key, and where a secret does or does not end up. Fixtures arrive by destructuring (`test.extend`), matchers say what happened in words (`expect.extend`, typed), and mocks are `vi.fn` spies. The repository's own tests use it.

```sh
pnpm add -D @webmcp-agents/testing vitest @vitest/browser-playwright
```

<include meta='title="vitest.config.ts"'>/_examples/testing/vitest.config.ts</include>

`*.test.*` files run in Node, `*.browser.test.*` files in Chromium, where a test needs no setup or cleanup of its own. Vitest 4 or later is the one required peer; `@webmcp-agents/chat`, `@webmcp-agents/telemetry`, `ai`, `react`, `react-dom`, `@playwright/test` and `@vitest/browser-playwright` are optional, and an entry that needs a missing one fails with a sentence naming it.

## Entries

| Entry | For | Contents |
|---|---|---|
| `@webmcp-agents/testing` | any test | [`test`](./test.md), [`callTool`](./call-tool.md), [`mockTool`](./mock-tool.md), [the page helpers](./helpers.md), `expect`, `vi` |
| `@webmcp-agents/testing/vitest` | the config | [`webAgentsProject`](./web-agents-project.md) |
| `@webmcp-agents/testing/setup` | `setupFiles` | [the browser setup](./setup.md): polyfill, reduced motion, deterministic ids, cleanup and leak checks |
| `@webmcp-agents/testing/matchers` | `setupFiles` | the matchers alone (a page that must stay without WebMCP); `webAgentsMatchers` (every matcher, for your own `expect.extend`) and the `WebAgentsMatchers` type |
| `@webmcp-agents/testing/chat` | agents, the chat | [`mockAdapter`](./mock-adapter.md), [`mockChatServer`](./mock-chat-server.md), [`renderChat`](./render-chat.md) |
| `@webmcp-agents/testing/server` | `/api/chat` | [`mockModel`](./mock-model.md), [`chatRequest`, `readChatStream`, `withSession`](./server-requests.md) |
| `@webmcp-agents/testing/telemetry` | spans | [`memoryExporter`, `spanTree`](./telemetry.md) |
| `@webmcp-agents/testing/playwright` | end to end | [`openApp`, `runTool`, `listTools`, `parkedOn`, `confirm`](./playwright.md) |

## Fixtures

| Fixture | Description |
|---|---|
| [`tools`](./tools.md) | The page's tools as an agent reaches them: `call`, `list`, `mock`, `settled`. |
| [`events`](./events.md) | Every `AgentEvent` from the start of the test. |
| [`user`](./user.md) | Trusted input: `confirm`, `moveOn`, `scroll`, `click`, `type`. |
| [`mount`](./mount.md) | Mount HTML or a React element; removed after the test. |
| [`redactor`](./redactor.md) | A fresh page redactor, reset after the test. |
| [`runs`](./runs.md) | Run events (0.5.0). |
| [`spans`](./spans.md) | Every browser span of the test, in memory (needs `@webmcp-agents/telemetry`). |

## Matchers

| Matcher | Passes when |
|---|---|
| [`toBeToolResult`](./to-be-tool-result.md) | The call succeeded (its text matches). |
| [`toBeToolError`](./to-be-tool-error.md) | The call failed (with that code). |
| [`toHaveStructuredContent`](./to-have-structured-content.md) | `structuredContent` has these values. |
| [`toHaveStarted`](./to-have-started.md) | A tool run started. |
| [`toHaveFilled`](./to-have-filled.md) | The agent typed into a field. |
| [`toHaveParked`](./to-have-parked.md) | A tool waited for the person. |
| [`toHaveYielded`](./to-have-yielded.md) | The cursor got out of the way. |
| [`toHaveEventOrder`](./to-have-event-order.md) | Events happened in this order. |
| [`toHaveCalledTool`](./to-have-called-tool.md) | The run called a tool. |
| [`toHaveCalledTools`](./to-have-called-tools.md) | The run called exactly these tools, in order. |
| [`toHaveAnswered`](./to-have-answered.md) | The run answered this. |
| [`toHaveFinishedWith`](./to-have-finished-with.md) | The run ended this way. |
| [`toHaveBeenOfferedTools`](./to-have-been-offered-tools.md) | The model was offered these tools. |
| [`toContainSensitive`](./to-contain-sensitive.md) | A secret is in this sink (use it negated). |
| [`toHaveSpan`](./to-have-span.md), [`toBeOneTrace`](./to-be-one-trace.md) | A span by name and attributes; one trace with one root. |
| [`toHaveNoHardcodedText`](./to-have-no-hardcoded-text.md) | The rendered chat shows no string outside its catalog. |

## See also

- [Test what you build](../../testing/index.mdx): the guide, one page per layer
