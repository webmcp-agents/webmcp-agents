import { type AgentEvent, onAgentEvent } from "@webmcp-agents/core";

/** An `AgentEvent` of one type. */
export type AgentEventOf<K extends AgentEvent["type"]> = Extract<AgentEvent, { type: K }>;

/**
 * Every `AgentEvent` the visual layer emitted since {@link recordEvents} started, in order. The event matchers
 * (`toHaveStarted`, `toHaveFilled`, `toHaveParked`, `toHaveYielded`, `toHaveEventOrder`, `toContainSensitive`) read it.
 */
export interface EventLog {
  /** The events so far (the same array grows while recording). */
  readonly events: AgentEvent[];
  /** Their types, in order: `["start", "fill", "result"]`. */
  types(): AgentEvent["type"][];
  /** The events of one type. */
  of<K extends AgentEvent["type"]>(type: K): AgentEventOf<K>[];
  /** Forget what was recorded so far; keep recording. */
  clear(): void;
  /** Stop recording. Idempotent. The `events` fixture stops for you. */
  stop(): void;
}

/** Marks an object as an {@link EventLog}, so matchers can tell it from any `{ events }`. */
export const EVENT_LOG: unique symbol = Symbol.for("web-agents.testing.event-log") as never;

/**
 * Record every agent event until `stop()`. The `events` fixture does this for you around each test.
 *
 * @example
 * const log = recordEvents();
 * await callTool("add_to_cart", { qty: 2 });
 * expect(log).toHaveFilled("qty", "2");
 * log.stop();
 */
export function recordEvents(): EventLog {
  const events: AgentEvent[] = [];
  const off = onAgentEvent((e) => events.push(e));
  let stopped = false;
  return {
    [EVENT_LOG]: true,
    events,
    types: () => events.map((e) => e.type),
    of: <K extends AgentEvent["type"]>(type: K) => events.filter((e): e is AgentEventOf<K> => e.type === type),
    clear: () => {
      events.length = 0;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      off();
    },
  } as EventLog;
}

/** True for a log made by {@link recordEvents}. */
export const isEventLog = (value: unknown): value is EventLog =>
  typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[EVENT_LOG] === true;
