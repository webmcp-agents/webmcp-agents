/**
 * The bridge to a tracer provider the page already runs (the OpenTelemetry Web SDK, Sentry, Datadog RUM), or one
 * passed in. Its own chunk: `@opentelemetry/api` is loaded only on pages that have a provider.
 *
 * A provider makes its own span ids, so a span here is created when it ends (with its recorded start time), its parent
 * first. A run span is created under its `traceparent`'s span context, so it lands in the same trace as the server's
 * step spans (which hang under that id).
 */
import { type Context, ROOT_CONTEXT, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { TracerProvider } from "../shared/types";
import type { Sink } from "./engine";
import type { SpanRecord } from "./types";

/**
 * A sink that turns span records into spans of `provider` (`"global"`: the page's registered one), under the
 * instrumentation scope `scope` (passed in, so this chunk shares no module with the main one).
 */
export function createBridge(provider: TracerProvider | "global", scope: string, version: string): Sink {
  const source = provider === "global" ? trace.getTracerProvider() : provider;
  const tracer = source.getTracer(scope, version) as ReturnType<typeof trace.getTracer>;
  const started = new Map<string, SpanRecord>();
  const live = new Map<string, { span: Span; ctx: Context }>();

  const ensure = (id: string): { span: Span; ctx: Context } | undefined => {
    const known = live.get(id);
    if (known) return known;
    const r = started.get(id);
    if (!r) return undefined;
    const parent =
      (r.parentSpanId && ensure(r.parentSpanId)?.ctx) ||
      trace.setSpanContext(ROOT_CONTEXT, { traceId: r.traceId, spanId: r.parentSpanId ?? r.spanId, traceFlags: 1, isRemote: true });
    const span = tracer.startSpan(r.name, { startTime: r.startTime, kind: SpanKind.INTERNAL }, parent);
    const made = { span, ctx: trace.setSpan(parent, span) };
    live.set(id, made);
    return made;
  };

  const flushable = (): { forceFlush?: () => Promise<void> } => {
    const p = source as { getDelegate?: () => unknown; forceFlush?: () => Promise<void> };
    return (typeof p.getDelegate === "function" ? p.getDelegate() : p) as { forceFlush?: () => Promise<void> };
  };

  return {
    start(r) {
      started.set(r.spanId, r);
    },
    end(r) {
      if (!started.has(r.spanId)) started.set(r.spanId, r);
      const made = ensure(r.spanId);
      started.delete(r.spanId);
      live.delete(r.spanId);
      if (!made) return;
      const { span } = made;
      span.updateName(r.name);
      span.setAttributes(r.attributes);
      for (const e of r.events) span.addEvent(e.name, e.attributes, e.time);
      if (r.status.code !== "unset")
        span.setStatus({ code: r.status.code === "error" ? SpanStatusCode.ERROR : SpanStatusCode.OK, message: r.status.message });
      span.end(r.endTime);
    },
    drop(id) {
      // a span a child already needed was created: end it bare rather than leave it open in the app's processors
      live.get(id)?.span.end();
      live.delete(id);
      started.delete(id);
    },
    async flush() {
      await flushable()
        .forceFlush?.()
        .catch(() => {});
    },
  };
}
