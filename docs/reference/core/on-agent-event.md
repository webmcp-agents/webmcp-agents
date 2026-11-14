---
description: "Subscribes to everything the visual layer observes, in order: tool starts, field fills, parks, results, errors, cancels, and the cursor yielding to or resuming after the person."
---

# `onAgentEvent`

Subscribes to everything the visual layer observes, in order: tool starts, field fills, parks, results, errors, cancels, and the cursor yielding to or resuming after the person. Reach for it to build your own status UI, logging or tests; the devtools and the chat do the same instead of reading internals.

## Import

```ts
import { onAgentEvent } from "@webmcp-agents/core";
import type { AgentEvent } from "@webmcp-agents/core";
```

## Example

A banner that shows what the agent is waiting for and hides when the call ends.

<include meta='title="agent-banner.ts"'>/_examples/shared/reference/core/on-agent-event.ts</include>

## Options

`onAgentEvent(listener)` takes one argument.

| Name | Type | Default | Description |
|---|---|---|---|
| `listener` | `(e: AgentEvent) => void` | required | Called for every event, in order, as it happens. Switch on `e.type`; the variants are listed below. |

### `AgentEvent`

One object per event, discriminated by `type`.

| `type` | Other fields | When |
|---|---|---|
| `start` | `tool: string`, `at: number`, `args?: unknown` | A tool run started (the first lifecycle signal seen). `at` is `performance.now()`. `args` is what the agent passed, when known (tools from `defineWebTool` and `useWebTool`; declarative forms only show `fill`s). A call whose input fails its schema still starts and answers with the error, without the cursor moving. |
| `fill` | `tool: string`, `field: string`, `value: string \| boolean` | The agent's value went into a field, once the cursor has typed it. `field` is the parameter's name for a tool (the control's `name` for a declarative form); the value is a boolean for a checkbox, and `"••••"` for a password field. A custom widget the cursor only visited emits none. |
| `park` | `tool: string`, `prompt: string` | The tool is waiting for the person: the browser paused on a submit button, a tool is waiting for their click on its control, or the page asked them something (see [`waitingForUser`](./waiting-for-user.md)). `prompt` says what to do. |
| `result` | `tool: string`, `result: unknown`, `ms: number` | The tool answered the agent. `ms` is measured from the run's start. |
| `error` | `tool: string`, `error: string`, `ms: number` | The tool failed; `error` is the text the agent got. |
| `cancel` | `tool: string` | The call was cancelled. |
| `yield` | `reason: "pointer" \| "keyboard" \| "wheel" \| "touch"` | The person started interacting and the cursor got out of the way. |
| `resume` | none | The person has been quiet long enough for the cursor to show again. |

## Returns

An unsubscribe function: `() => void`. Call it to stop listening.

## Notes

- A listener that throws never breaks a tool run: the error is caught and logged with `console.error`.
- The `log` option of [`installAgentVisuals`](./install-agent-visuals.md) receives the same entries.
- Listeners are module-level: subscribing works whether or not the visuals are installed, but most events come from the visual layer. `park` is also emitted by [`waitingForUser`](./waiting-for-user.md) and by confirm-gated tools.
- There is no replay: a listener sees only events after it subscribed.

## See also

- [The agent cursor](../../concepts/agent-cursor.mdx), what the events describe
- [`installAgentVisuals`](./install-agent-visuals.md), the layer that emits them
- [`waitingForUser`](./waiting-for-user.md), a tool saying it waits for the person
- [`useAgentEvents`](../react/use-agent-events.md), the same events in a React component
