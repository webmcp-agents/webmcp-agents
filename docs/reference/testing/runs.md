---
description: "Every AgentRunEvent of the test, for the run matchers and privacy checks."
---

# `runs`

The `runs` fixture: every [`AgentRunEvent`](../chat/on-agent-run.md) of the test (the chat's runs, `useWebAgent`'s, `agent.invoke`'s, sub-agents' included), as a `RunLog`. The run matchers read it, and so does `toContainSensitive`. Events are recorded as a listener sees them by default: tool inputs and outputs redacted. It needs `@webmcp-agents/chat`; a test that never destructures `runs` loads nothing.

## Import

```ts
import { test } from "@webmcp-agents/testing";
import { recordRuns } from "@webmcp-agents/testing/chat"; // the same log, outside the fixture
import type { RunLog, RunLogOptions } from "@webmcp-agents/testing";
```

## Example

```ts
test("reorders", async ({ runs }) => {
  await shopper.invoke("Reorder my last purchase.", { adapter });
  expect(runs).toHaveCalledTools(["track_last_order", "add_to_cart"]);
  expect(runs).toHaveFinishedWith("stop");
  expect(runs).not.toContainSensitive(["A1234567"]);
});
```

## Options

The `RunLog`'s members. `recordRuns(options?)` takes `RunLogOptions`: `raw` (default `false`) records inputs and outputs as they are.

| Name | Type | Default | Description |
|---|---|---|---|
| `events` | `readonly AgentRunEvent[]` | — | The run events, in order. The array grows while recording. |
| `types` | `() => AgentRunEvent["type"][]` | — | Their types, in order: `["run-start", "step-start", "step-finish", "run-finish"]`. |
| `of` | `(run: string) => AgentRunEvent[]` | — | The events of one run, by its id (`ref.run`). |
| `runIds` | `() => string[]` | — | The ids of the runs that started, in order, sub-agents' included. |
| `clear` | `() => void` | — | Forget what was recorded so far; keep recording. |
| `stop` | `() => void` | — | Stop recording. The fixture stops for you after the test. |

## Returns

A `RunLog`. `isRunLog(value)` tells one from any other `{ events }`.

## Notes

What the run matchers read from a `RunLog`:

| Matcher | Reads |
|---|---|
| `toHaveCalledTool(s)` | Every `tool-start`, in order, sub-agents' calls included (attributed to their agent). |
| `toHaveFinishedWith` | The last top-level `run-finish` (a sub-agent's does not count): unlike a `WebAgentResult`, it tells `"max-steps"` from `"stop"`, and gives an error's `code`. |
| `toHaveAnswered` | Nothing: run events carry no answer text. It fails with a sentence; pass the `WebAgentResult` or the `mockAdapter`. |

Under `@webmcp-agents/testing/setup` run and conversation ids are deterministic (`run-1`, `conversation-1`).

## See also

- [`onAgentRun`](../chat/on-agent-run.md)
- [`toHaveCalledTools`](./to-have-called-tools.md)
- [`toHaveFinishedWith`](./to-have-finished-with.md)
- [`mockAdapter`](./mock-adapter.md)
