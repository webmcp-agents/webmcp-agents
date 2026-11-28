/**
 * `observeAgents()`: subscribe to the page's agent runs and hand them to the span builder (`./engine`), which is a
 * chunk of its own loaded when the first consented run starts. What a page downloads up front is this subscription
 * and a queue; a page where no run happens, or where consent is never given, downloads nothing more.
 */
import { onAgentRun } from "@webmcp-agents/chat";
import { onAgentEvent } from "@webmcp-agents/core";
import { isSampled, parseTraceparent } from "../shared/util";
import { type CustomHook, hooks } from "./custom";
import type { Engine } from "./engine";
import type { ObserveAgentsOptions } from "./types";

/**
 * What `observeAgents()` returns: call it to stop observing (buffered spans are sent first); `flush()` sends what is
 * buffered now and resolves once the exporters took it (never rejects).
 *
 * @experimental
 */
export type StopObserving = (() => void) & { flush(): Promise<void> };

/** Custom events and spans held at most while the engine chunk loads; past it they are dropped. */
const MAX_QUEUED_CUSTOM = 256;

const noop = Object.assign((): void => {}, { flush: async () => {} });

/**
 * Send the page's agent runs to an OpenTelemetry backend: each run, tool call and on-device model step becomes a span
 * in the same trace as the server's model steps. By default spans are posted to the app's relay at `/api/telemetry`
 * (`observability.relay()`), so no backend key reaches the page; a page that already runs OpenTelemetry gets them in
 * its own provider. Content (tool inputs, results) is left out unless `recordInputs` / `recordOutputs`, and
 * everything is redacted. Returns the function that stops observing (buffered spans are sent first), with `flush()`.
 *
 * @experimental
 *
 * @example
 * import { observeAgents } from "@webmcp-agents/telemetry";
 * const stop = observeAgents({ enabled: () => consent.analytics });
 */
export function observeAgents(options: ObserveAgentsOptions = {}): StopObserving {
  // nowhere to send: no span is built and nothing is loaded
  if (typeof document === "undefined" || (options.exporters?.length === 0 && !options.tracerProvider)) return noop;
  const { enabled = () => true } = options;
  let engine: Engine | undefined | null;
  let loading: Promise<unknown> | undefined;
  /** What arrived while the engine loads (run events, resumes, the app's custom ops), in order. */
  const queue: ((e: Engine) => void)[] = [];
  /** Custom ops waiting in `queue`: bounded, so an app that records in a loop while the chunk loads holds little. */
  let customs = 0;
  /** `start`: a root run's start with consent, which is what loads the engine. */
  const take = (op: (e: Engine) => void, start?: boolean, custom?: boolean): void => {
    if (engine !== undefined) {
      if (engine) op(engine);
      return;
    }
    // before the first consented run nothing is kept; after it, everything waits for the engine in order
    if (!loading && !start) return;
    if (custom && ++customs > MAX_QUEUED_CUSTOM) return;
    queue.push(op);
    loading ??= import("./engine")
      .then(
        (m) => (engine = m.createEngine(options) ?? null),
        () => (engine = null),
      )
      .then(() => {
        for (const q of queue.splice(0)) if (engine) q(engine);
      });
  };
  // ---------- the runs this observer records (for the app's custom events and spans) ----------
  /** Open recorded runs: run id → its top-level run's id. In start order. */
  const runs = new Map<string, string>();
  /** Open tool calls of recorded runs: call id → run id. */
  const calls = new Map<string, string>();
  const stopRuns = onAgentRun((e) => {
    let consent: boolean | undefined;
    let kept: boolean | undefined;
    const { run, parent } = e.ref;
    // consent and sampling are decided when a root run starts, not when the engine gets to it: the run's step requests
    // carry the sampled flag only if this run span will exist (the engine chunk may still be loading)
    if (e.type === "run-start") {
      if (!parent) {
        try {
          consent = enabled() === true;
        } catch {
          consent = false;
        }
        kept =
          consent &&
          isSampled(options.sampling, parseTraceparent(e.ref.traceparent)?.[0], { agent: e.agent, conversation: e.ref.conversation });
        // (an engine that turned out to have nowhere to send records nothing: no flag then)
        if (kept && engine !== null) {
          e.ref.sampled = true;
          runs.set(run, run);
        }
      } else {
        const root = runs.get(calls.get(parent)!);
        if (root) runs.set(run, root);
      }
    } else if (e.type === "run-finish") {
      runs.delete(run);
      for (const [c, r] of calls) if (r === run) calls.delete(c);
    } else if (e.type === "tool-start" && runs.has(run)) calls.set(e.call, run);
    else if (e.type === "tool-finish") calls.delete(e.call);
    take((x) => x.event(e, consent, kept), consent);
  });
  const stopVisuals = onAgentEvent((e) => {
    if (e.type === "resume") take((x) => x.resume());
  });
  let seq = 0;
  const hook: CustomHook = (span, name, attributes, target) => {
    let run = target;
    if (run === undefined) {
      // the most recent top-level run, then the most recent run under it (a sub-agent's, while one runs)
      let top: string | undefined;
      for (const [r, root] of runs) if (r === root) top = r;
      for (const [r, root] of runs) if (root === top) run = r;
    }
    if (!run || !runs.has(run) || engine === null) return undefined;
    const at = performance.now();
    // copied now: the app may change its object before a queued op reaches the engine
    const op = { run, name, attributes: attributes && { ...attributes }, at };
    if (!span) {
      take((x) => x.custom({ type: "event", ...op }), false, true);
      return undefined;
    }
    let call: string | undefined;
    let open = 0;
    for (const [c, r] of calls)
      if (r === run) {
        call = c;
        open++;
      }
    const id = ++seq;
    take((x) => x.custom({ type: "start", id, ...op, call: open === 1 ? call : undefined }), false, true);
    return (error) => {
      const at = performance.now();
      take((x) => x.custom({ type: "end", id, at, error }));
    };
  };
  hooks.add(hook);
  const flushNow = (): Promise<void> => (loading ?? Promise.resolve()).then(() => engine?.flush()).catch(() => {});
  const flush = (): void => void flushNow();
  const onHide = (): void => {
    if (document.visibilityState === "hidden") flush();
  };
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onHide);
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    stopRuns();
    stopVisuals();
    hooks.delete(hook);
    removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onHide);
    flush();
  };
  return Object.assign(stop, { flush: flushNow });
}
