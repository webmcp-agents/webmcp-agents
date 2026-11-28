/**
 * The tracer the AI SDK integration gets for one request. It is how this package works without touching global
 * telemetry state:
 *
 * - **Parent.** A span started with no active parent is put under the request's `traceparent` (the browser's run
 *   span), passed explicitly, so no global context manager is needed.
 * - **Shape.** With a browser parent (a `traceparent` whose sampled flag says the page records it), the AI SDK's own
 *   `invoke_agent` and `agent_step` wrapper spans are passed through (not recorded), so each `chat <model>` span is a
 *   direct child of the browser's `invoke_agent` (§7.5).
 * - **Ids.** Every span gets the request's `webmcp.*` ids.
 * - **Redaction.** Every attribute, event and status message is mapped (`metadataMapping`) and redacted before it
 *   reaches the provider, so a provider this package does not own (the app's global one) never sees raw values.
 */
import type * as Api from "@opentelemetry/api";
import type { Attributes } from "../shared/types";
import { cleanAttributes } from "../shared/util";

/** What one request's tracer knows. */
export interface RequestScope {
  /** The request's `webmcp.*` ids, set on every span. */
  ids: Attributes;
  /** The browser's run span, from the request's `traceparent`. */
  remote?: Api.SpanContext;
  /** Map then redact attributes (the same function the relay uses). */
  finalize(attributes: Attributes): Attributes;
  /** Redact free text (a status message, an exception). */
  text(value: string): string;
  /** Through a provider this package does not own, `spanFilter` runs when a span starts; false skips it. */
  filter?: (name: string, attributes: Attributes) => boolean;
  /** Told of each span recorded without a parent (the request's root, for the app's own spans to join). */
  root?: (span: Api.SpanContext) => void;
}

/** The AI SDK's wrapper spans (`invoke_agent`, `agent_step`), dropped when the browser's run span is the parent. */
const wrapper = (options: Api.SpanOptions | undefined): boolean => {
  const op = options?.attributes?.["gen_ai.operation.name"];
  return op === "invoke_agent" || op === "agent_step";
};

/** A span whose attributes, events and status pass through `scope` before they reach the real span. */
function redactingSpan(span: Api.Span, scope: RequestScope): Api.Span {
  const own: Api.Span = {
    spanContext: () => span.spanContext(),
    setAttribute(key, value) {
      if (value !== undefined) span.setAttributes(scope.finalize(cleanAttributes({ [key]: value })));
      return own;
    },
    setAttributes(attributes) {
      span.setAttributes(scope.finalize(cleanAttributes(attributes)));
      return own;
    },
    addEvent(name, attributesOrTime, time) {
      if (
        attributesOrTime &&
        typeof attributesOrTime === "object" &&
        !Array.isArray(attributesOrTime) &&
        !(attributesOrTime instanceof Date)
      )
        span.addEvent(name, scope.finalize(cleanAttributes(attributesOrTime as Api.Attributes)), time);
      else span.addEvent(name, attributesOrTime as Api.TimeInput | undefined, time);
      return own;
    },
    addLink(link) {
      span.addLink(link);
      return own;
    },
    addLinks(links) {
      span.addLinks(links);
      return own;
    },
    setStatus(status) {
      span.setStatus(status.message ? { ...status, message: scope.text(status.message) } : status);
      return own;
    },
    updateName(name) {
      span.updateName(scope.text(name));
      return own;
    },
    end: (endTime) => span.end(endTime),
    isRecording: () => span.isRecording(),
    recordException(exception, time) {
      // only what the SDK records of an exception: its type and a redacted message (never a stack of values)
      const e = exception as { name?: unknown; message?: unknown; code?: unknown };
      const type = typeof e === "object" && e && typeof e.name === "string" ? e.name : "Error";
      const message = scope.text(typeof exception === "string" ? exception : typeof e?.message === "string" ? e.message : "");
      span.recordException({ name: type, message }, time);
    },
  };
  return own;
}

/** A tracer over `base` for one request (see the module comment). */
export function requestTracer(api: typeof Api, base: Api.Tracer, scope: RequestScope): Api.Tracer {
  const parentOf = (ctx: Api.Context | undefined): Api.Context => {
    const c = ctx ?? api.context.active();
    return !api.trace.getSpanContext(c) && scope.remote ? api.trace.setSpanContext(c, scope.remote) : c;
  };
  const startSpan = (name: string, options: Api.SpanOptions = {}, ctx?: Api.Context): Api.Span => {
    const parent = parentOf(ctx);
    const parentSpan = api.trace.getSpanContext(parent);
    if (scope.remote && parentSpan && wrapper(options)) return api.trace.wrapSpanContext(parentSpan);
    const attributes = scope.finalize({ ...scope.ids, ...cleanAttributes(options.attributes) });
    if (scope.filter) {
      let keep = true;
      try {
        keep = scope.filter(name, attributes) !== false;
      } catch {
        keep = false;
      }
      // a skipped span hands its parent on, so its children still join the trace
      if (!keep) return api.trace.wrapSpanContext(parentSpan ?? api.INVALID_SPAN_CONTEXT);
    }
    const span = base.startSpan(scope.text(name), { ...options, attributes }, parent);
    if (!parentSpan) scope.root?.(span.spanContext());
    return redactingSpan(span, scope);
  };
  const tracer = {
    startSpan,
    startActiveSpan(name: string, ...args: unknown[]) {
      const fn = args.pop() as (span: Api.Span) => unknown;
      const [options, ctx] = args as [Api.SpanOptions | undefined, Api.Context | undefined];
      const parent = parentOf(ctx);
      const span = startSpan(name, options, parent);
      return api.context.with(api.trace.setSpan(parent, span), fn, undefined, span);
    },
  };
  return tracer as unknown as Api.Tracer;
}
