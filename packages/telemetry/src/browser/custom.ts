/**
 * The app's own events and spans in an agent run's trace: `recordAgentEvent()` and `withAgentSpan()`. Up front this
 * is only a forwarding stub: each running `observeAgents()` registers a hook here that knows which runs it records;
 * the span itself is built by the engine chunk, through the same pipeline as the package's own spans.
 */
import type { RunRef } from "@webmcp-agents/chat";
import type { CustomAttributes } from "../shared/types";
import { around } from "../shared/util";

/**
 * Options for `recordAgentEvent()` / `withAgentSpan()`.
 *
 * @experimental
 */
export interface AgentSpanOptions {
  /**
   * The run to attach to: a run id or a `RunRef` (from `onAgentRun`). Default: the run that is running now, the most
   * recently started top-level run, or its sub-agent's run while one is running.
   */
  run?: string | Pick<RunRef, "run">;
}

/**
 * An observer's entry point: `end` is undefined for an event; for a span, a function that ends it (with the error it
 * failed with, if any), or undefined when there is no recorded run to attach to.
 */
export type CustomHook = (
  span: boolean,
  name: string,
  attributes: CustomAttributes | undefined,
  run: string | undefined,
) => ((error?: unknown) => void) | undefined;

/** The running observers' hooks (`observeAgents()` adds one, its stop removes it). */
export const hooks = new Set<CustomHook>();

let warned = false;
/** Telemetry never breaks the app: a failure here is swallowed, and logged once. */
const fail = (err: unknown): undefined => {
  if (!warned) {
    warned = true;
    console.error(`[web-agents/telemetry] a custom event or span was skipped: ${(err as Error)?.message ?? err}`);
  }
  return undefined;
};

/** Hand the op to every observer; the span's end functions, joined. */
function forward(span: boolean, name: string, attributes?: CustomAttributes, options?: AgentSpanOptions) {
  if (!hooks.size || typeof name !== "string" || !name) return undefined;
  const run = typeof options?.run === "object" ? options.run?.run : options?.run;
  const ends: ((error?: unknown) => void)[] = [];
  for (const hook of hooks)
    try {
      const end = hook(span, name, attributes, run);
      if (end) ends.push(end);
    } catch (err) {
      fail(err);
    }
  return ends.length
    ? (error?: unknown): void => {
        for (const end of ends)
          try {
            end(error);
          } catch (err) {
            fail(err);
          }
      }
    : undefined;
}

/**
 * Add an event (a point in time with attributes) to the running agent run's `invoke_agent` span: what the app saw
 * happen during the run (a coupon applied, a result shown). It is mapped, redacted and filtered with the run's span,
 * and sent with it. A no-op, cheap, when `observeAgents()` is not running, when no recorded run is running (no
 * consent, not sampled, or between runs: consent and sampling are decided per run, so outside one there is no
 * decision to follow and the event is dropped), or when `options.run` names a run that is not recorded.
 *
 * @experimental
 *
 * @example
 * import { recordAgentEvent } from "@webmcp-agents/telemetry";
 * recordAgentEvent("cart.coupon_applied", { "cart.coupon": code, "cart.total": total });
 */
export function recordAgentEvent(name: string, attributes?: CustomAttributes, options?: AgentSpanOptions): void {
  try {
    forward(false, name, attributes, options);
  } catch (err) {
    fail(err);
  }
}

/**
 * Run `fn` inside a span of the running agent run: a child of the tool call that is running when exactly one is, else
 * of the run's `invoke_agent` span. Timed around `fn` (sync, or until its promise settles); a throw or rejection sets
 * the span's status to error (`error.type` is the error's name) and is rethrown unchanged. Returns what `fn` returns.
 * The span goes through the same pipeline as the package's own: `metadataMapping`, redaction, `spanFilter`, then the
 * relay or the page's provider; it carries `webmcp.custom: true` and the run's ids. With no recorded run (see
 * `recordAgentEvent`), `fn` just runs. Telemetry never breaks `fn`: a failure in it is swallowed and logged once.
 *
 * @experimental
 *
 * @example
 * import { withAgentSpan } from "@webmcp-agents/telemetry";
 * const results = await withAgentSpan("search.query", () => api.search(query), { "search.kind": "flights" });
 */
export function withAgentSpan<T>(name: string, fn: () => T, attributes?: CustomAttributes, options?: AgentSpanOptions): T {
  let end: ((error?: unknown) => void) | undefined;
  try {
    end = forward(true, name, attributes, options);
  } catch (err) {
    fail(err);
  }
  return end ? around(fn, end) : fn();
}
