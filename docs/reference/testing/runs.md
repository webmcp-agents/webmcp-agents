---
description: "Every AgentRunEvent of the chat's runs (0.5.0)."
---

# `runs`

The `runs` fixture: every `AgentRunEvent` of the chat's runs, for the run matchers. It arrives with the chat's run events (0.5.0): until then it is typed, and destructuring it fails the test with a sentence saying so. Assert on the `WebAgentResult` or the [`mockAdapter`](./mock-adapter.md) meanwhile: the run matchers read both.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ runs }) => {});
```

## Example

```ts
expect(runs).toHaveCalledTools(["track_last_order", "add_to_cart"]);
```

## Options

The `RunLog`'s members.

| Name | Type | Default | Description |
|---|---|---|---|
| `events` | `readonly AgentRunEvent[]` | — | The run events, in order (0.5.0). |

## Returns

A `RunLog`.

## See also

- [`toHaveCalledTools`](./to-have-called-tools.md)
- [`mockAdapter`](./mock-adapter.md)
