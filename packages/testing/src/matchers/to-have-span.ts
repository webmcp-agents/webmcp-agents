import type { MatcherResult, MatcherState } from "vitest";
import { hint, MatcherInputError, show } from "../format";
import { readSpans } from "../telemetry";

/**
 * The spans include one named `name` (exactly, or matching a RegExp) whose attributes include `attributes` (each value
 * compared with `equals`, so asymmetric matchers work). Reads a memory exporter, an OpenTelemetry
 * `InMemorySpanExporter`, an array of spans or span trees.
 *
 * @example
 * expect(spans).toHaveSpan("execute_tool add_to_cart", { "webmcp.tool.confirm": "accepted" });
 * expect(spans).toHaveSpan(/^chat /, { "gen_ai.usage.input_tokens": expect.any(Number) });
 */
export function toHaveSpan(
  this: MatcherState,
  received: unknown,
  name: string | RegExp,
  attributes?: Record<string, unknown>,
): MatcherResult {
  const spans = readSpans(received);
  if (!spans)
    throw new MatcherInputError(
      `toHaveSpan needs spans: a memoryExporter(), an InMemorySpanExporter or an array of spans, got ${show(received, 60)}.`,
    );
  const named = spans.filter((s) => (typeof name === "string" ? s.name === name : name.test(s.name)));
  const matching = named.filter((s) => Object.entries(attributes ?? {}).every(([k, v]) => this.equals(s.attributes[k], v)));
  const head = hint(this, "toHaveSpan", attributes ? [name, attributes] : [name]);
  const list = spans.length ? spans.map((s) => `    ${s.name}`).join("\n") : "    (no spans)";
  const closest = named[0];
  return {
    pass: matching.length > 0,
    message: () =>
      this.isNot
        ? `${head}\n\n  Expected no span ${show(name)}${attributes ? " with these attributes" : ""}, but found ${matching.length}.`
        : closest
          ? `${head}\n\n  Found ${named.length} span(s) ${show(name)}, none with these attributes. The first one has:\n${Object.keys(
              attributes ?? {},
            )
              .map((k) => `    ${k}: ${show(closest.attributes[k], 80)} (expected ${show(attributes?.[k], 80)})`)
              .join("\n")}`
          : `${head}\n\n  Expected a span ${show(name)}, but there is none. Spans:\n${list}`,
  };
}
