/**
 * `observeAgents()`: subscribe to the page's agent runs and hand them to the span builder (`./engine`), which is a
 * chunk of its own loaded when the first consented run starts. What a page downloads up front is this subscription
 * and a queue; a page where no run happens, or where consent is never given, downloads nothing more.
 */
import { type AgentRunEvent, onAgentRun } from "@webmcp-agents/chat";
import { onAgentEvent } from "@webmcp-agents/core";
import type { Engine } from "./engine";
import type { ObserveAgentsOptions } from "./types";

/**
 * What `observeAgents()` returns: call it to stop observing (buffered spans are sent first); `flush()` sends what is
 * buffered now and resolves once the exporters took it (never rejects).
 *
 * @experimental
 */
export type StopObserving = (() => void) & { flush(): Promise<void> };

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
  /** Events (and resumes, as `undefined`) that arrived while the engine loads, in order. */
  const queue: [AgentRunEvent | undefined, boolean | undefined][] = [];
  const deliver = (e: AgentRunEvent | undefined, consent?: boolean): void => {
    if (e) engine?.event(e, consent);
    else engine?.resume();
  };
  const take = (e: AgentRunEvent | undefined, consent?: boolean): void => {
    if (engine !== undefined) {
      deliver(e, consent);
      return;
    }
    // before the first consented run nothing is kept; after it, everything waits for the engine in order
    if (!loading && !consent) return;
    queue.push([e, consent]);
    loading ??= import("./engine")
      .then(
        (m) => (engine = m.createEngine(options) ?? null),
        () => (engine = null),
      )
      .then(() => {
        for (const [q, c] of queue.splice(0)) deliver(q, c);
      });
  };
  const stopRuns = onAgentRun((e) => {
    let consent: boolean | undefined;
    // consent is read when a root run starts, not when the engine gets to it
    if (e.type === "run-start" && !e.ref.parent)
      try {
        consent = enabled() === true;
      } catch {
        consent = false;
      }
    take(e, consent);
  });
  const stopVisuals = onAgentEvent((e) => {
    if (e.type === "resume") take(undefined);
  });
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
    removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onHide);
    flush();
  };
  return Object.assign(stop, { flush: flushNow });
}
