/**
 * The `exporters` option of `observeAgents()`, resolved: a chunk of its own, loaded only when the option is given, so
 * the default path (the relay) does not carry it. `post` and `warn` are passed in so this chunk shares no module
 * with the main one.
 */
import type { Attributes, OtlpTarget } from "../shared/types";
import type { BrowserSpanExporter } from "./types";

/** An exporter for one `exporters` entry, or undefined (logged once) when it cannot be used in a browser. */
export function toExporter(
  entry: string | OtlpTarget | BrowserSpanExporter,
  resource: Attributes,
  post: (url: string, resource: Attributes, headers?: Record<string, string>) => BrowserSpanExporter,
  warn: (message: string) => void,
): BrowserSpanExporter | undefined {
  if (typeof entry === "string") return post(entry, resource);
  if (typeof (entry as BrowserSpanExporter).export === "function") return entry as BrowserSpanExporter;
  const target = entry as OtlpTarget;
  if (target.endpoint && target.endpoints) {
    warn("an OTLP target has both `endpoint` and `endpoints`: give one. That target is off.");
    return undefined;
  }
  if ((target.protocol ?? "http/json") !== "http/json") {
    warn(`a browser sends OTLP as "http/json" only, not "${target.protocol}": send through the relay instead. That target is off.`);
    return undefined;
  }
  const url = target.endpoints?.traces ?? (target.endpoint && `${target.endpoint.replace(/\/+$/, "")}/v1/traces`);
  if (!url) {
    warn("an OTLP target in the browser needs `endpoint` or `endpoints` (a browser has no OTEL_* env). That target is off.");
    return undefined;
  }
  return post(url, resource, target.headers);
}
