/**
 * What every matcher shares: reading the value it was given (a tool result, an event log, a run), and saying what
 * happened in words. A value a matcher cannot read fails it with a sentence saying what it needs; that is thrown, so
 * it fails under `.not` too.
 */
import type { AgentEvent, ModelContextToolResult } from "@webmcp-agents/core";
import type { MatcherState } from "vitest";
import { isEventLog } from "./helpers/events";

/** A matcher was given a value it cannot read. */
export class MatcherInputError extends Error {
  override name = "MatcherInputError";
}

/** Short, one-line JSON of `value` (strings quoted), cut at `max` characters. */
export function show(value: unknown, max = 160): string {
  let text: string;
  if (value instanceof RegExp) text = String(value);
  else if (typeof value === "string") text = JSON.stringify(value);
  else if (value === undefined) text = "undefined";
  else if (typeof value === "function") text = `[function ${value.name || "anonymous"}]`;
  else if (isAsymmetric(value)) text = (value as { toString(): string }).toString();
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

/** What kind of value `value` is, for "got …" in a message. */
export function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === "string") return `the string ${show(value, 60)}`;
  if (typeof value === "object") return `an object with keys ${show(Object.keys(value as object).slice(0, 6))}`;
  return `${typeof value} ${show(value, 60)}`;
}

/** An asymmetric matcher (`expect.any(…)`, `expect.stringContaining(…)`). */
export const isAsymmetric = (value: unknown): boolean =>
  typeof value === "object" && value !== null && typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function";

/** The first line of every message: the call as written. */
export function hint(state: MatcherState, matcher: string, args: unknown[] = []): string {
  return `expect(received).${state.isNot ? "not." : ""}${matcher}(${args.map((a) => show(a, 80)).join(", ")})`;
}

/** `text` matches `expected`: a string is contained, a RegExp tested, an asymmetric matcher asked. */
export function textMatches(state: MatcherState, text: string, expected: unknown): boolean {
  if (typeof expected === "string") return text.includes(expected);
  if (expected instanceof RegExp) return expected.test(text);
  return state.equals(text, expected);
}

// ---------- tool results ----------

const isToolResult = (value: unknown): value is ModelContextToolResult =>
  typeof value === "object" && value !== null && Array.isArray((value as ModelContextToolResult).content);

/** Read a tool result, or throw a sentence saying what the matcher needs. */
export function readToolResult(received: unknown, matcher: string): ModelContextToolResult {
  if (isToolResult(received)) return received;
  if (received === null) {
    throw new MatcherInputError(
      `${matcher} needs a tool result ({ content, isError? }), got null: the call navigated the page away, so there is no result to check.`,
    );
  }
  throw new MatcherInputError(
    `${matcher} needs a tool result ({ content, isError? }) from callTool() or tools.call(), got ${kindOf(received)}.` +
      (typeof received === "string" ? " A tool's raw output is not its result: call it through callTool()." : ""),
  );
}

/** The result's text parts, joined with a newline. */
export const resultText = (r: ModelContextToolResult): string =>
  (r.content ?? []).map((c) => ("text" in c && typeof c.text === "string" ? c.text : "")).join("\n");

const ERROR_TEXT = /^Error(?: \[([a-z0-9_.-]+)\])?:/i;

/** Failed: `isError`, or a text that starts with `Error:` / `Error [code]:` (a declarative form cannot set `isError`). */
export const isFailed = (r: ModelContextToolResult): boolean => r.isError === true || ERROR_TEXT.test(resultText(r));

/** The result's error code: `structuredContent.error.code`, else the `[code]` of its text. */
export function errorCode(r: ModelContextToolResult): string | undefined {
  const fromData = (r.structuredContent?.error as { code?: unknown } | undefined)?.code;
  if (typeof fromData === "string") return fromData;
  return ERROR_TEXT.exec(resultText(r))?.[1];
}

// ---------- event logs ----------

const isAgentEvent = (value: unknown): value is AgentEvent =>
  typeof value === "object" && value !== null && typeof (value as AgentEvent).type === "string";

/** Read agent events from an `EventLog` (the `events` fixture, `recordEvents()`) or an array of them. */
export function readEvents(received: unknown, matcher: string): AgentEvent[] {
  if (isEventLog(received)) return received.events;
  if (Array.isArray(received) && received.every(isAgentEvent)) return received;
  throw new MatcherInputError(
    `${matcher} needs the events fixture (or recordEvents(), or an array of AgentEvent), got ${kindOf(received)}.`,
  );
}

/** One event in a few words: `start add_to_cart`, `fill qty = "2"`, `park place_order ("Click Place order")`. */
export function describeEvent(e: AgentEvent): string {
  switch (e.type) {
    case "start":
    case "cancel":
      return `${e.type} ${e.tool}`;
    case "fill":
      return `fill ${e.field} = ${show(e.value, 40)} (${e.tool})`;
    case "park":
      return `park ${e.tool} (${show(e.prompt, 60)})`;
    case "result":
      return `result ${e.tool}`;
    case "error":
      return `error ${e.tool}: ${show(e.error, 60)}`;
    case "yield":
      return `yield (${e.reason})`;
    default:
      return e.type;
  }
}

/** The events as a numbered list, or "no events". */
export function listEvents(events: readonly AgentEvent[], max = 12): string {
  if (!events.length) return "  (no events)";
  const lines = events.slice(0, max).map((e, i) => `  ${i + 1}. ${describeEvent(e)}`);
  if (events.length > max) lines.push(`  … ${events.length - max} more`);
  return lines.join("\n");
}
