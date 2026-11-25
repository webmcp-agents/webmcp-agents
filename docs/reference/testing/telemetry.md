---
description: "An in-memory span exporter for both sides of a trace, and spans as trees."
---

# `memoryExporter, spanTree`

`@webmcp-agents/testing/telemetry`: an exporter that keeps spans in memory, and a tree view of them. The exporter is both a browser span exporter (`observeAgents({ exporters: [memory] })`) and an OpenTelemetry `SpanExporter` (`defineObservability({ exporters: [memory] })`), so one test can hold both sides of a trace in one shape. The entry imports neither `@webmcp-agents/telemetry` nor `@opentelemetry/*`.

## Import

```ts
import { memoryExporter, spanTree } from "@webmcp-agents/testing/telemetry";
import type { MemoryExporter, RecordedSpan, SpanNode } from "@webmcp-agents/testing/telemetry";
```

## Example

```ts
const browser = memoryExporter();
const server = memoryExporter();
const stop = observeAgents({ exporters: [browser], batchSize: 1 });
const observability = defineObservability({ exporters: [server], env: {} });
// … one turn through the handler, then:
await stop.flush();
await observability.flush();
const [run] = spanTree([...browser.spans, ...server.spans]);
```

## Options

`memoryExporter()` takes nothing; `spanTree(spans)` takes the spans.

| Name | Type | Default | Description |
|---|---|---|---|
| `spans` | `readonly RecordedSpan[]` | required | `spanTree`: the spans to arrange. |

### `RecordedSpan`

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | required | The span's name. |
| `traceId` | `string` | required | Its trace, in hex. |
| `spanId` | `string` | required | Its id, in hex. |
| `parentSpanId` | `string` | not set on a root | The parent's id. |
| `attributes` | `Record<string, unknown>` | `{}` | Its attributes. |
| `events` | `{ name, attributes? }[]` | `[]` | Its events. |
| `status` | `"unset" \| "ok" \| "error"` | `"unset"` | Its status. |
| `startTime` | `number` | `0` | Milliseconds since the epoch. |
| `endTime` | `number` | `0` | Milliseconds since the epoch. |
| `scope` | `string` | — | The instrumentation scope's name. |

## Returns

`memoryExporter`: a `MemoryExporter` (`spans`, `reset`, `export`, `forceFlush`, `shutdown`). `spanTree`: `SpanNode[]` (`{ span, children }`), roots first, each level in start order; a root is a span whose parent is not among them.

### Also exported

- `readSpans(value)`: spans from a memory exporter, an array (span records, `ReadableSpan`s or recorded spans), an OpenTelemetry `InMemorySpanExporter`, or span trees, as `RecordedSpan[]`; `undefined` for anything else. The span matchers use it.
- `recordSpan(value)`: one span of either side as a `RecordedSpan`.
- `isMemoryExporter(value)`, `MEMORY_EXPORTER`: tell a memory exporter from any other object.

## See also

- [The `spans` fixture](./spans.md)
- [`toHaveSpan`](./to-have-span.md), [`toBeOneTrace`](./to-be-one-trace.md)
