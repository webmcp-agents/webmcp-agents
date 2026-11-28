---
description: "Subscribes to every agent run on the page: run, step and tool-call events, in order, with the ids the server's spans carry."
---

# `onAgentRun`

Subscribes to every agent run on the page: the chat's, [`useWebAgent`](./use-web-agent.md)'s, [`agent.invoke`](./define-web-agent.md#agentinvoke)'s and their sub-agents', with the cloud and the on-device adapter. Each event says what happened (a run started, a model step ended with its token usage, a tool call waited for the person) and carries the run's ids, the same ids the server's spans carry. Use it to send agent analytics anywhere with no telemetry package; `@webmcp-agents/telemetry` builds its browser spans from it.

Experimental: new in 0.5.0, its event fields may still change in a minor release.

## Import

```ts
import { onAgentRun } from "@webmcp-agents/chat";
import type { AgentRunEvent, AgentRunListener, OnAgentRunOptions, RunRef, StepUsage } from "@webmcp-agents/chat";
```

## Example

Two analytics events: a tool that failed, and every finished run.

```ts
const stop = onAgentRun((e) => {
  if (e.type === "tool-finish" && e.state === "error") analytics.track("agent_tool_failed", { tool: e.tool, code: e.code });
  if (e.type === "run-finish") analytics.track("agent_run", { reason: e.reason, steps: e.steps, ms: Math.round(e.ms) });
});
```

## Options

`onAgentRun(listener, options?)`. `listener` gets each `AgentRunEvent`; `options` is an `OnAgentRunOptions`:

| Name | Type | Default | Description |
|---|---|---|---|
| `raw` | `boolean` | `false` | Receive tool inputs, outputs and a parked call's prompt as they are. By default they pass through the page's redactor ([`configureRedaction`](../core/configure-redaction.md)) and the tool's own `sensitive` fields, so a password or a passport number reads as the mask. For the app's own trusted code only: anything that sends events off the page should keep the default. |

### The events

Every event has `type` and `ref` (a `RunRef`). Times (`at`) are `performance.now()`; durations are milliseconds.

| `type` | Members | When |
|---|---|---|
| `run-start` | `agent?`, `adapter`, `at` | A run began. `adapter` is the adapter's id (`"cloud"`, `"local"`…); `agent` the agent's id, when one runs. |
| `step-start` | `step`, `tools`, `at` | A model step began. `step` counts from 1 in the run; `tools` is how many tools the model was offered. |
| `step-finish` | `step`, `ms`, `firstTokenMs?`, `model?`, `usage?`, `toolCalls` | The step's reply is complete, before its tool calls run. `firstTokenMs` is the time to its first text, reasoning or call. `usage` and `model` are what the server reported (none on device, none with `usageToClient: false`, none from a 0.4.0 server). |
| `tool-start` | `step`, `call`, `tool`, `at`, `input?` | A call began running on the page, or a `delegate_to_<id>` call began its sub-agent's run. `input` is what the model sent. |
| `tool-park` | `call`, `tool`, `prompt`, `at` | The call waits for the person (a confirm-gated submit). `prompt` is what they are asked to do. |
| `tool-yield` | `call`, `reason`, `at` | The person used the page while the call ran, and the cursor got out of the way. |
| `tool-finish` | `call`, `tool`, `ms`, `waitedMs`, `state`, `code?`, `output?` | The call ended. `waitedMs` is the part of `ms` it spent parked; `state` is `"done"`, `"error"` or `"cancelled"`; `code` is a failed call's error code (`cancelled` for a stopped one). |
| `run-finish` | `reason`, `ms`, `steps`, `error?`, `code?` | The run ended: `"stop"`, `"max-steps"`, `"aborted"` or `"error"`. For an error, `code` is the [chat error code](./chat-error-codes.md) and `error` the catalog's English text for it, never the conversation. Nothing of this run is emitted after it. |

### `RunRef`

| Name | Type | Default | Description |
|---|---|---|---|
| `conversation` | `string` | required | The same for every turn of one chat: kept across a reload and a restore, new after "new chat". `useWebAgent` and `agent.invoke` start a conversation per call. |
| `run` | `string` | required | One user turn, one `agent.invoke`, or one sub-agent run. |
| `parent` | `string` | not set | For a sub-agent's run, the id of the `delegate_to_<id>` call that started it. |
| `traceparent` | `string` | set | The run's W3C trace context, sent as the `traceparent` header of each of its step requests. A sub-agent's run shares its parent's trace id. Its flags are `01` (sampled) while `sampled` is true, else `00`, read as each request is sent. |
| `sampled` | `boolean` | `false` | Whether something on the page records this run's span, so the server puts its step spans under it. A listener that records the run sets it to `true` on `run-start`, which arrives before the run's first step request is built; [`observeAgents`](../../observability/observe-agents.mdx) does once consent and its sampling keep the run. A sub-agent's run starts with its parent's value. Left `false`, the server keeps its own root span instead of pointing at a parent no backend receives. |

Ids come from `crypto.randomUUID()` (unique across pages and tabs), or random bytes where that needs a secure context the
page does not have. Under `@webmcp-agents/testing/setup` they are deterministic (`run-1`, `conversation-1`).

## Returns

A function that unsubscribes: that listener receives no further event.

## Notes

- **Order.** A run is `run-start`, then per model step `step-start` … `step-finish`, then that step's calls, each `tool-start` (`tool-park`, `tool-yield`) … `tool-finish`, and last `run-finish`. A sub-agent's events fall between its delegate call's `tool-start` and `tool-finish`, with `ref.parent` set to that call.
- **Stopping.** When the person stops a run, the call in flight ends `cancelled`, then `run-finish` says `aborted`, innermost run first.
- **A listener that throws** never breaks a run: the others still get the event, and the error is logged once per listener.
- **Redaction.** Inputs and outputs are redacted by default. `onAgentEvent` (core) is unchanged and still hands its listeners raw `args` and `result`.
- **Usage.** Token counts reach the browser only from a 0.5.0 server with `usageToClient` on (the default).
- Listeners are shared through a `globalThis` slot, so two copies of the package on one page (two bundles) report to the same listeners.

## See also

- [`createChatHandler`](./create-chat-handler.md#telemetry), the server side: the same ids on every step's spans
- [Adapter types](./adapter-types.md), `RunRef` on `AgentRunRequest` and the step parts
- [`runs`](../testing/runs.md), the testing kit's fixture that records these events
