/**
 * Everything the visual layer observes, in order. Devtools, chat widgets and
 * tests subscribe with `onAgentEvent`; the `log` option of installAgentVisuals
 * receives the same entries.
 */
import type { YieldReason } from "./user-yield";
import type { FieldControl, FieldValue } from "./write";

export type AgentEvent =
  /**
   * A tool run started (first lifecycle signal seen). `at` is performance.now().
   * `args`: what the agent passed, when known (imperative tools; declarative forms only show `fill`s).
   * A tool whose input fails its schema still starts and answers with the error, without the cursor moving.
   */
  | { type: "start"; tool: string; at: number; args?: unknown }
  /**
   * The agent's value went into a field: one of a declarative form, or the field a tool's parameter is typed into
   * (`field` is the control's `name` for a form, the parameter's name for a tool). Emitted once the cursor has typed it.
   * `from` / `control` let chat restore put the prior value back (in-memory only; not serializable).
   */
  | { type: "fill"; tool: string; field: string; value: FieldValue; from?: FieldValue; control?: FieldControl }
  /** The tool is waiting for the user (the browser paused on a submit button, or the page asked them something). */
  | { type: "park"; tool: string; prompt: string }
  /** The tool answered the agent. `ms` is measured from the run's start. */
  | { type: "result"; tool: string; result: unknown; ms: number }
  | { type: "error"; tool: string; error: string; ms: number }
  | { type: "cancel"; tool: string }
  /** The user started interacting; the cursor got out of the way. */
  | { type: "yield"; reason: YieldReason }
  /** The user has been quiet long enough for the cursor to show again. */
  | { type: "resume" };

const listeners = new Set<(e: AgentEvent) => void>();

/** Subscribe to agent activity. Returns an unsubscribe function. */
export function onAgentEvent(listener: (e: AgentEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @internal Deliver an event. A throwing listener never breaks a tool run. */
export function emit(e: AgentEvent): void {
  for (const listener of listeners) {
    try {
      listener(e);
    } catch (err) {
      console.error("[web-agents] agent event listener threw", err);
    }
  }
}

/**
 * Say that `tool` is waiting for the person (a choice, a confirmation) with `prompt` as what they should do. The chat
 * shows it on the call, and agents don't time the call out while the person is being asked.
 */
export function waitingForUser(tool: string, prompt: string): void {
  emit({ type: "park", tool, prompt });
}
