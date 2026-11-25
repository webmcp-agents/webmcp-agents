/**
 * @webmcp-agents/testing/telemetry: spans in memory, for tests of `observeAgents` and the handler's telemetry.
 *
 * Typed shells until @webmcp-agents/telemetry exists (0.5.0, phase 5): importing this entry is safe, calling either
 * function fails with a sentence saying so.
 */
import { notYet } from "../not-yet";

/** A finished span, as the exporter keeps it. Completed in phase 5. */
export interface RecordedSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  attributes: Record<string, unknown>;
}

/** An exporter that keeps spans in memory. Completed in phase 5. */
export interface MemoryExporter {
  /** The finished spans, in order. */
  readonly spans: readonly RecordedSpan[];
  /** Forget them. */
  reset(): void;
}

/** A span with its children, for readable assertions on a trace. Completed in phase 5. */
export interface SpanNode {
  span: RecordedSpan;
  children: SpanNode[];
}

/** An in-memory span exporter. Phase 5 of 0.5.0: fails with a sentence until then. */
export function memoryExporter(): MemoryExporter {
  return notYet("memoryExporter()", "telemetry");
}

/** The spans as trees, root first. Phase 5 of 0.5.0: fails with a sentence until then. */
export function spanTree(_spans: readonly RecordedSpan[]): SpanNode[] {
  return notYet("spanTree()", "telemetry");
}
