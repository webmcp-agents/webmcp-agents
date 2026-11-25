/**
 * @webmcp-agents/testing/telemetry: spans in memory, for tests of `observeAgents` and of the chat handler's telemetry.
 *
 *   const memory = memoryExporter();
 *   observeAgents({ exporters: [memory] });                       // browser spans
 *   defineObservability({ exporters: [memory], env: {} });        // server spans: it is an OpenTelemetry SpanExporter too
 *   expect(memory).toHaveSpan("execute_tool add_to_cart");
 *
 * Nothing here imports `@webmcp-agents/telemetry` or `@opentelemetry/*`: the exporter is structural, so this entry
 * loads without either.
 */

/** A finished span, the same shape whichever side recorded it. Times are ms since the epoch (0 when unknown). */
export interface RecordedSpan {
  name: string;
  traceId: string;
  spanId: string;
  /** Absent for a root span. */
  parentSpanId?: string;
  attributes: Record<string, unknown>;
  events: { name: string; attributes?: Record<string, unknown> }[];
  /** `unset`, `ok` or `error`. */
  status: "unset" | "ok" | "error";
  startTime: number;
  endTime: number;
  /** The instrumentation scope's name (`@webmcp-agents/telemetry` for this library's spans). */
  scope?: string;
}

/** The marker that tells a memory exporter from any other object (and from a plain array). */
export const MEMORY_EXPORTER: unique symbol = Symbol.for("web-agents.testing.memory-exporter");

/**
 * Spans in memory. It is both a browser span exporter (`observeAgents({ exporters: [memory] })`) and an OpenTelemetry
 * `SpanExporter` (`defineObservability({ exporters: [memory] })`, or any SDK provider), so one test can collect both
 * sides of a trace.
 */
export interface MemoryExporter {
  /** The finished spans, in the order they were exported. */
  readonly spans: readonly RecordedSpan[];
  /** Forget them. */
  reset(): void;
  /** Takes spans of either side: browser span records, or OpenTelemetry `ReadableSpan`s with the result callback. */
  export(spans: readonly unknown[], resultCallback?: (result: { code: number }) => void): void;
  /** Nothing to send: resolves. */
  forceFlush(): Promise<void>;
  /** Nothing to release: resolves. */
  shutdown(): Promise<void>;
  readonly [MEMORY_EXPORTER]: true;
}

/** A span with its children, for readable assertions on a trace. */
export interface SpanNode {
  span: RecordedSpan;
  children: SpanNode[];
}

type HrTime = [number, number];
const ms = (t: unknown): number =>
  typeof t === "number" ? t : Array.isArray(t) && t.length === 2 ? (t as HrTime)[0] * 1000 + (t as HrTime)[1] / 1e6 : 0;
const STATUS = ["unset", "ok", "error"] as const;

/** One span of either side as a {@link RecordedSpan}, or undefined for anything else. */
export function recordSpan(value: unknown): RecordedSpan | undefined {
  const s = value as Record<string, unknown> | null;
  if (!s || typeof s !== "object" || typeof s.name !== "string") return undefined;
  const events = (Array.isArray(s.events) ? s.events : []).map((e: { name?: unknown; attributes?: unknown }) => ({
    name: String(e?.name),
    ...(e?.attributes ? { attributes: { ...(e.attributes as Record<string, unknown>) } } : {}),
  }));
  // an OpenTelemetry ReadableSpan
  if (typeof s.spanContext === "function") {
    const ctx = (s.spanContext as () => { traceId: string; spanId: string })();
    const parent = (s.parentSpanContext as { spanId?: string } | undefined)?.spanId ?? (s.parentSpanId as string | undefined);
    const status = s.status as { code?: number } | undefined;
    return {
      name: s.name,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      ...(parent ? { parentSpanId: parent } : {}),
      attributes: { ...(s.attributes as Record<string, unknown>) },
      events,
      status: STATUS[status?.code ?? 0] ?? "unset",
      startTime: ms(s.startTime),
      endTime: ms(s.endTime),
      scope: (s.instrumentationScope as { name?: string } | undefined)?.name,
    };
  }
  // a browser span record (or a RecordedSpan)
  if (typeof s.traceId === "string" && typeof s.spanId === "string") {
    const status = s.status as { code?: string } | string | undefined;
    return {
      name: s.name,
      traceId: s.traceId,
      spanId: s.spanId,
      ...(typeof s.parentSpanId === "string" && s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
      attributes: { ...(s.attributes as Record<string, unknown>) },
      events,
      status: ((typeof status === "string" ? status : status?.code) as RecordedSpan["status"] | undefined) ?? "unset",
      startTime: ms(s.startTime),
      endTime: ms(s.endTime),
      scope: typeof s.scope === "string" ? s.scope : "@webmcp-agents/telemetry",
    };
  }
  return undefined;
}

/**
 * An exporter that keeps every span in memory, for tests.
 *
 * @example
 * const memory = memoryExporter();
 * const stop = observeAgents({ exporters: [memory], batchSize: 1 });
 * await runTurn();
 * await stop.flush();
 * expect(memory).toBeOneTrace();
 */
export function memoryExporter(): MemoryExporter {
  const spans: RecordedSpan[] = [];
  return {
    get spans() {
      return spans;
    },
    reset() {
      spans.length = 0;
    },
    export(batch, resultCallback) {
      for (const s of batch) {
        const recorded = recordSpan(s);
        if (recorded) spans.push(recorded);
      }
      resultCallback?.({ code: 0 });
    },
    forceFlush: async () => {},
    shutdown: async () => {},
    [MEMORY_EXPORTER]: true,
  };
}

/** True for a {@link memoryExporter}. */
export const isMemoryExporter = (value: unknown): value is MemoryExporter =>
  typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[MEMORY_EXPORTER] === true;

/**
 * Spans from a memory exporter, an array (span records, `ReadableSpan`s or recorded spans), an OpenTelemetry
 * `InMemorySpanExporter` (`getFinishedSpans()`), or span trees. Anything else: undefined.
 */
export function readSpans(value: unknown): RecordedSpan[] | undefined {
  if (isMemoryExporter(value)) return [...value.spans];
  const finished = (value as { getFinishedSpans?: () => unknown[] } | null)?.getFinishedSpans;
  if (typeof finished === "function") return finished.call(value).flatMap((s) => recordSpan(s) ?? []);
  if (!Array.isArray(value)) return undefined;
  const flat: unknown[] = [];
  const add = (v: unknown): void => {
    const node = v as SpanNode;
    if (node && typeof node === "object" && "span" in node && Array.isArray(node.children)) {
      flat.push(node.span);
      for (const child of node.children) add(child);
    } else flat.push(v);
  };
  for (const v of value) add(v);
  const spans = flat.map(recordSpan);
  return spans.every((s): s is RecordedSpan => !!s) ? spans : undefined;
}

/**
 * The spans as trees: each root (a span whose parent is not among them) with its children, both in start order.
 *
 * @example
 * const [run] = spanTree(memory.spans);
 * expect(run.children.map((c) => c.span.name)).toEqual(["chat claude-sonnet-5-5", "execute_tool add_to_cart", "chat claude-sonnet-5-5"]);
 */
export function spanTree(spans: readonly RecordedSpan[]): SpanNode[] {
  const nodes = new Map(spans.map((span) => [span.spanId, { span, children: [] as SpanNode[] }]));
  const roots: SpanNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.span.parentSpanId ? nodes.get(node.span.parentSpanId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const order = (list: SpanNode[]): SpanNode[] => {
    list.sort((a, b) => a.span.startTime - b.span.startTime);
    for (const n of list) order(n.children);
    return list;
  };
  return order(roots);
}
