/**
 * The `http/json` exporter: OTLP JSON over `fetch`, no dependency, so it runs on Node, on the edge and in workers.
 * Encodes OpenTelemetry `ReadableSpan`s (anything shaped like one) per the OTLP/JSON spec: hex ids, nanosecond
 * strings, one `resourceSpans` per resource and one `scopeSpans` per scope.
 */
import type { HrTime, ReadableSpanLike, SpanExporter } from "../shared/types";
import { keyValues } from "../shared/util";
import type { ResolvedTarget } from "./config";

/** `[s, ns]` as a decimal nanosecond string (exact: BigInt). */
const nanos = (t: HrTime | undefined): string => {
  if (!t) return "0";
  try {
    return (BigInt(Math.trunc(t[0])) * 1_000_000_000n + BigInt(Math.trunc(t[1]))).toString();
  } catch {
    return "0";
  }
};

/** An OTLP JSON `ExportTraceServiceRequest` for these spans. */
export function encodeSpans(spans: readonly ReadableSpanLike[]) {
  const byResource = new Map<unknown, { attributes: Readonly<Record<string, unknown>>; scopes: Map<string, ReadableSpanLike[]> }>();
  for (const span of spans) {
    let entry = byResource.get(span.resource);
    if (!entry) {
      entry = { attributes: span.resource?.attributes ?? {}, scopes: new Map() };
      byResource.set(span.resource, entry);
    }
    const scope = `${span.instrumentationScope?.name ?? ""}\u0000${span.instrumentationScope?.version ?? ""}`;
    entry.scopes.set(scope, [...(entry.scopes.get(scope) ?? []), span]);
  }
  return {
    resourceSpans: [...byResource.values()].map(({ attributes, scopes }) => ({
      resource: { attributes: keyValues(attributes) },
      scopeSpans: [...scopes.entries()].map(([key, list]) => {
        const [name, version] = key.split("\u0000");
        return {
          scope: { name, ...(version && { version }) },
          spans: list.map((s) => {
            const ctx = s.spanContext();
            return {
              traceId: ctx.traceId,
              spanId: ctx.spanId,
              ...(s.parentSpanContext?.spanId && { parentSpanId: s.parentSpanContext.spanId }),
              name: s.name,
              // the API's SpanKind starts at INTERNAL = 0; OTLP's at UNSPECIFIED = 0, INTERNAL = 1
              kind: (typeof s.kind === "number" ? s.kind : 0) + 1,
              startTimeUnixNano: nanos(s.startTime),
              endTimeUnixNano: nanos(s.endTime),
              attributes: keyValues(s.attributes),
              events: (s.events ?? []).map((e) => ({ name: e.name, timeUnixNano: nanos(e.time), attributes: keyValues(e.attributes) })),
              status: { code: s.status?.code ?? 0, ...(s.status?.message && { message: s.status.message }) },
            };
          }),
        };
      }),
    })),
  };
}

/**
 * A `SpanExporter` posting OTLP JSON to `target.url`. Each export is aborted after `target.timeout` ms; a failed or
 * refused export reports failure to the pipeline (which logs it once) and is never retried.
 */
export function httpJsonExporter(target: ResolvedTarget): SpanExporter {
  return {
    export(spans, done) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), target.timeout);
      (timer as { unref?: () => void }).unref?.();
      let body: string;
      try {
        body = JSON.stringify(encodeSpans(spans));
      } catch (error) {
        clearTimeout(timer);
        done({ code: 1, error: error as Error });
        return;
      }
      fetch(target.url, { method: "POST", headers: { "content-type": "application/json", ...target.headers }, body, signal: ctrl.signal })
        .then(
          async (res) => {
            // read the body so the connection is released; never surfaced
            await res.text().catch(() => "");
            done(res.ok ? { code: 0 } : { code: 1, error: new Error(`the collector answered ${res.status}`) });
          },
          (error: unknown) => done({ code: 1, error: error instanceof Error ? error : new Error(String(error)) }),
        )
        .finally(() => clearTimeout(timer));
    },
    async shutdown() {},
    async forceFlush() {},
  };
}
