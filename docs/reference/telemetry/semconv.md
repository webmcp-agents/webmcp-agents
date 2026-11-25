---
description: "Every span name, attribute key and event name this package writes, as constants, and the span tree they make."
---

# Span names and attributes

Every name this package writes is a constant exported from both entries, so a `spanFilter`, a `metadataMapping` or a test never retypes a string. The GenAI names follow the OpenTelemetry GenAI semantic conventions as they stood in November 2026; those conventions are still in Development, so a name may change in a minor release when they do. The `webmcp.*` names are this library's own.

Experimental: new in 0.5.0.

## Import

```ts
import { ATTR_CONVERSATION_ID, SPAN_EXECUTE_TOOL } from "@webmcp-agents/telemetry";
import { ATTR_CONVERSATION_ID, SCOPE_NAME } from "@webmcp-agents/telemetry/server";
```

## Example

Group conversations in a backend that groups by `session.id`:

```ts
defineObservability({ metadataMapping: { [ATTR_CONVERSATION_ID]: "session.id" } });
```

## Options

The constants, by span.

| Name | Type | Default | Description |
|---|---|---|---|
| `SCOPE_NAME` | `"@webmcp-agents/telemetry"` | constant | The instrumentation scope of the browser's spans and the server's `gen_ai` ones; the only scope the relay accepts. |
| `SCOPE_NAME_LEGACY` | `"@webmcp-agents/telemetry/legacy"` | constant | The scope of the `ai.*` model spans (`conventions: "legacy"` / `"both"`). |
| `SPAN_INVOKE_AGENT`, `SPAN_EXECUTE_TOOL`, `SPAN_CHAT` | `string` | `invoke_agent`, `execute_tool`, `chat` | The operations; a span is named `<operation> <subject>`. `DEFAULT_AGENT_NAME` (`web-agent`) is the subject of a run without an agent. |
| `ATTR_OPERATION_NAME` | `string` | `gen_ai.operation.name` | Every span. |
| `ATTR_CONVERSATION_ID`, `ATTR_RUN_ID` | `string` | `webmcp.conversation.id`, `webmcp.run.id` | Every span, browser and server. |
| `ATTR_STEP` | `string` | `webmcp.step` | `chat` and `execute_tool` spans: the model step, from 1. |
| `ATTR_AGENT_ID` | `string` | `gen_ai.agent.id` | `invoke_agent`: the agent's id. The server's spans carry `ATTR_WEBMCP_AGENT_ID` (`webmcp.agent.id`). |
| `ATTR_PARENT_CALL_ID` | `string` | `webmcp.parent.call.id` | A sub-agent's run: its delegating call. |
| `ATTR_SESSION_ID` | `string` | `webmcp.session.id` | Server spans, with chat sessions on (redacted by default: "session" is a sensitive key). |
| `ATTR_ADAPTER`, `ATTR_RUN_REASON`, `ATTR_RUN_STEPS`, `ATTR_PAGE` | `string` | `webmcp.adapter`, `webmcp.run.reason`, `webmcp.run.steps`, `webmcp.page` | `invoke_agent`: the adapter, how the run ended (`stop`, `max-steps`, `aborted`, `error`), its steps, and the page (origin and path; query values redacted). |
| `ATTR_TOOL_NAME`, `ATTR_TOOL_CALL_ID` | `string` | `gen_ai.tool.name`, `gen_ai.tool.call.id` | `execute_tool`. |
| `ATTR_TOOL_STATE`, `ATTR_TOOL_ERROR_CODE`, `ATTR_TOOL_WAITED_MS` | `string` | `webmcp.tool.state`, `webmcp.tool.error.code`, `webmcp.tool.waited_ms` | `execute_tool`: `done`, `error` or `cancelled`; a failed call's code; the time spent waiting for the person. |
| `ATTR_TOOL_CONFIRM` | `string` | `webmcp.tool.confirm` | `execute_tool`, only for a call that waited: `accepted`, `cancelled` or `timeout`. |
| `ATTR_TOOL_CALL_ARGUMENTS`, `ATTR_TOOL_CALL_RESULT` | `string` | `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result` | `execute_tool`, only with `recordInputs` / `recordOutputs`, redacted JSON. |
| `ATTR_REQUEST_MODEL`, `ATTR_USAGE_INPUT_TOKENS`, `ATTR_USAGE_OUTPUT_TOKENS` | `string` | `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` | `chat` spans. |
| `ATTR_ERROR_TYPE` | `string` | `error.type` | A failed run or call (with status `error`). |
| `EVENT_PARK`, `EVENT_YIELD`, `EVENT_RESUME` | `string` | `webmcp.park`, `webmcp.yield`, `webmcp.resume` | Events on `execute_tool`: the call waits for the person (`prompt`), the cursor yields to them (`reason`), and comes back. |

## Notes

The span tree of one turn:

```text
invoke_agent <agent>           browser · one per run
├── chat <model>               server · one per model step (browser, for an on-device run)
├── execute_tool <tool>        browser · one per tool call, events park / yield / resume
│   └── invoke_agent <sub>     browser · a delegate_to_* call's sub-agent run
└── chat <model>
```

The server's `chat` spans also carry what the AI SDK's integration sets (`gen_ai.*` by default, `ai.*` with `conventions: "legacy"`).

## See also

- [`observeAgents`](./observe-agents.md), the browser spans
- [`defineObservability`](./define-observability.md), the server spans
