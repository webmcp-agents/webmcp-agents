import { type AgentRunEvent, onAgentRun } from "@webmcp-agents/chat";
import { RUN_LOG, type RunLog, type RunLogOptions } from "../run-record";

/**
 * Record every `AgentRunEvent` (the chat's, `useWebAgent`'s, `agent.invoke`'s, sub-agents' included) until `stop()`.
 * The `runs` fixture does this for you around each test. Inputs and outputs are recorded redacted, as an analytics
 * listener sees them; `{ raw: true }` records them as they are.
 *
 * @example
 * const log = recordRuns();
 * await shopper.invoke("Reorder my last purchase.", { adapter });
 * expect(log).toHaveCalledTools(["track_last_order", "add_to_cart"]);
 * expect(log.types()).toContain("step-finish");
 * log.stop();
 */
export function recordRuns(options: RunLogOptions = {}): RunLog {
  const events: AgentRunEvent[] = [];
  const off = onAgentRun((e) => events.push(e), { raw: options.raw === true });
  let stopped = false;
  return {
    [RUN_LOG]: true,
    events,
    types: () => events.map((e) => e.type),
    of: (run) => events.filter((e) => e.ref.run === run),
    runIds: () => [...new Set(events.filter((e) => e.type === "run-start").map((e) => e.ref.run))],
    clear: () => {
      events.length = 0;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      off();
    },
  } as RunLog;
}
