---
description: "Spans from observeAgents, kept in memory (telemetry, 0.5.0)."
---

# `spans`

The `spans` fixture: `observeAgents` wired to an in-memory exporter. It arrives with `@webmcp-agents/telemetry` (0.5.0): until then it is typed, and destructuring it fails the test with a sentence saying so.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ spans }) => {});
```

## Example

```ts
expect(spans).toBeOneTrace();
expect(spans).not.toContainSensitive(["A1234567"]);
```

## Options

The `MemoryExporter`'s members.

| Name | Type | Default | Description |
|---|---|---|---|
| `spans` | `readonly RecordedSpan[]` | — | The finished spans, in order (0.5.0). |
| `reset` | `() => void` | — | Forget them. |

## Returns

A `MemoryExporter`.

## See also

- [`toHaveSpan`](./to-have-span.md)
- [`memoryExporter`](./telemetry.md)
