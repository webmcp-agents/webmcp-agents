/**
 * The browser's built-in exporters: a POST of OTLP JSON to the app's relay (the default) or to a collector, and the
 * console. No dependency: `fetch` and `JSON` only.
 */
import { SCOPE_NAME } from "../semconv";
import type { Attributes } from "../shared/types";
import { keyValues, VERSION } from "../shared/util";
import type { BrowserSpanExporter, SpanRecord } from "./types";

/** The relay's default path: `observability.relay()` mounted at `/api/telemetry`. */
export const DEFAULT_RELAY = "/api/telemetry";

/** Milliseconds since the epoch as OTLP's nanosecond string. */
const ns = (ms: number): string => String(Math.round(ms * 1e6));

/** An OTLP JSON `ExportTraceServiceRequest` for these spans, under one resource and this package's scope. */
export const otlpBody = (resource: Attributes, spans: readonly SpanRecord[]) => ({
  resourceSpans: [
    {
      resource: { attributes: keyValues(resource) },
      scopeSpans: [
        {
          scope: { name: SCOPE_NAME, version: VERSION },
          spans: spans.map((s) => ({
            traceId: s.traceId,
            spanId: s.spanId,
            ...(s.parentSpanId && { parentSpanId: s.parentSpanId }),
            name: s.name,
            kind: 1,
            startTimeUnixNano: ns(s.startTime),
            endTimeUnixNano: ns(s.endTime),
            attributes: keyValues(s.attributes),
            events: s.events.map((e) => ({ name: e.name, timeUnixNano: ns(e.time), attributes: keyValues(e.attributes) })),
            status: {
              code: s.status.code === "error" ? 2 : s.status.code === "ok" ? 1 : 0,
              ...(s.status.message && { message: s.status.message }),
            },
          })),
        },
      ],
    },
  ],
});

/**
 * POSTs each batch as OTLP JSON. `keepalive` lets a batch sent while the page unloads arrive. A `404` / `405` means
 * there is no relay at that URL: nothing more is sent. Failures are swallowed: telemetry never breaks the page.
 */
export function postExporter(url: string, resource: Attributes, headers: Record<string, string> = {}): BrowserSpanExporter {
  let gone = false;
  return {
    export(spans) {
      if (gone || !spans.length) return;
      const body = JSON.stringify(otlpBody(resource, spans));
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        // the browser caps keepalive bodies at 64 KB (bytes, not UTF-16 code units: non-ASCII text counts more)
        keepalive: new TextEncoder().encode(body).byteLength < 60_000,
        credentials: "same-origin",
      }).then(
        (res) => {
          if (res.status === 404 || res.status === 405) gone = true;
        },
        () => {},
      );
    },
  };
}

/** One error per problem, so a bad option logs once however many runs it affects. */
const said = new Set<string>();
export const warnOnce = (message: string): void => {
  if (said.has(message)) return;
  said.add(message);
  console.error(`[web-agents/telemetry] ${message}`);
};
