import type { BrowserSpanExporter } from "./types";

/**
 * An exporter that prints each finished span to the console instead of sending it: for development, and to see what
 * would leave the page. Spans are already redacted when they reach it. No request is made.
 *
 * @experimental
 *
 * @example
 * import { consoleExporter, observeAgents } from "@webmcp-agents/telemetry";
 * observeAgents({ exporters: [consoleExporter()] });
 */
export function consoleExporter(): BrowserSpanExporter {
  return {
    export(spans) {
      for (const span of spans) console.log(`[web-agents/telemetry] ${span.name}`, span);
    },
  };
}
