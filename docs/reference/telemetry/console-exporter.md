---
description: "A browser span exporter that prints each span to the console instead of sending it."
---

# `consoleExporter`

An exporter for [`observeAgents`](./observe-agents.md) that prints each finished span to the console and sends nothing: for development, and to see exactly what would leave the page (spans are already redacted when they reach it).

Experimental: new in 0.5.0.

## Import

```ts
import { consoleExporter } from "@webmcp-agents/telemetry";
```

## Example

```ts
observeAgents({ exporters: [consoleExporter()] });
```

## Options

`consoleExporter()` takes none.

| Name | Type | Default | Description |
|---|---|---|---|
| (none) | | | |

## Returns

A `BrowserSpanExporter`: `export(spans)` logs `[web-agents/telemetry] <span name>` and the span record for each.

## See also

- [`observeAgents`](./observe-agents.md)
