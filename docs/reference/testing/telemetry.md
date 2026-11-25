---
description: "Spans in memory, as trees (telemetry, 0.5.0)."
---

# `memoryExporter, spanTree`

`@webmcp-agents/testing/telemetry`: an in-memory span exporter and a tree view of spans. They arrive with `@webmcp-agents/telemetry` (0.5.0): the entry is safe to import now, and calling either fails with a sentence saying so.

## Import

```ts
import { memoryExporter, spanTree } from "@webmcp-agents/testing/telemetry";
```

## Example

```ts
const exporter = memoryExporter();
const [root] = spanTree(exporter.spans);
```

## Options

`memoryExporter()` takes nothing; `spanTree(spans)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `spans` | `readonly RecordedSpan[]` | required | `spanTree`: the spans to arrange. |

## Returns

`memoryExporter`: a `MemoryExporter` (`spans`, `reset`). `spanTree`: `SpanNode`s, roots first.

## See also

- [The `spans` fixture](./spans.md)
- [`toHaveSpan`](./to-have-span.md)
