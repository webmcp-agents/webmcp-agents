---
description: "Every browser span of the test, kept in memory, with flush() for the buffered ones."
---

# `spans`

The `spans` fixture: [`observeAgents`](../../observability/observe-agents.mdx) sending every browser span of the test to an in-memory exporter, one span per batch, redacted as it would be exported. `flush()` waits for spans still on their way (the span builder loads when the first run starts). Observing stops after the test. It needs `@webmcp-agents/telemetry`; without it, destructuring `spans` fails with a sentence naming the package.

## Import

```ts
import { test } from "@webmcp-agents/testing";

test("…", async ({ spans }) => {});
```

## Example

```ts
await shopper.invoke("Two mugs.", { adapter });
await spans.flush();
expect(spans).toHaveSpan("execute_tool add_to_cart", { "webmcp.tool.state": "done" });
expect(spans).toBeOneTrace();
expect(spans).not.toContainSensitive(["4242"]);
```

## Options

The fixture's members (a `SpansFixture`, which is a [`MemoryExporter`](./telemetry.md) plus two).

| Name | Type | Default | Description |
|---|---|---|---|
| `spans` | `readonly RecordedSpan[]` | `[]` | The finished spans, in the order they were exported. |
| `reset` | `() => void` | — | Forget them. |
| `flush` | `() => Promise<void>` | — | Send what `observeAgents` still buffers, and resolve once it is here. Never rejects. |
| `stop` | `() => void` | — | Stop observing (the fixture does it after the test). |
| `export`, `forceFlush`, `shutdown` | | — | The exporter's own members (see [`memoryExporter`](./telemetry.md)). |

## Returns

A `SpansFixture`.

## Notes

- Only the browser's spans: for the server's, give a [`memoryExporter()`](./telemetry.md) to `defineObservability({ exporters })` and put both in one array for `toBeOneTrace`.
- `toContainSensitive` names "the spans" and the span a value was found in.

## See also

- [`toHaveSpan`](./to-have-span.md), [`toBeOneTrace`](./to-be-one-trace.md)
- [`memoryExporter`, `spanTree`](./telemetry.md)
- [`observeAgents`](../../observability/observe-agents.mdx)
