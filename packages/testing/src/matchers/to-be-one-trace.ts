import type { MatcherResult, MatcherState } from "vitest";
import { hint, MatcherInputError, show } from "../format";
import { readSpans, spanTree } from "../telemetry";

/**
 * Every span belongs to one trace, with one root (one span whose parent is not among them): browser and server spans
 * of a turn joined up. Reads what `toHaveSpan` reads. No spans at all fails.
 *
 * @example
 * expect([...browser.spans, ...server.spans]).toBeOneTrace();
 */
export function toBeOneTrace(this: MatcherState, received: unknown): MatcherResult {
  const spans = readSpans(received);
  if (!spans)
    throw new MatcherInputError(
      `toBeOneTrace needs spans: a memoryExporter(), an InMemorySpanExporter or an array of spans, got ${show(received, 60)}.`,
    );
  const traces = [...new Set(spans.map((s) => s.traceId))];
  const roots = spanTree(spans);
  const head = hint(this, "toBeOneTrace");
  const why =
    spans.length === 0
      ? "there are no spans"
      : traces.length > 1
        ? `they belong to ${traces.length} traces (${traces.map((t) => t.slice(0, 8)).join(", ")}…)`
        : `there are ${roots.length} roots: ${roots.map((r) => show(r.span.name, 60)).join(", ")}`;
  return {
    pass: spans.length > 0 && traces.length === 1 && roots.length === 1,
    message: () =>
      this.isNot
        ? `${head}\n\n  Expected the ${spans.length} span(s) not to form one trace with one root, but they do (root ${show(roots[0]?.span.name)}).`
        : `${head}\n\n  Expected one trace with one root, but ${why}.`,
  };
}
