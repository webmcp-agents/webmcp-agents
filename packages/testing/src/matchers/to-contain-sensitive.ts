import type { AgentEvent } from "@webmcp-agents/core";
import type { MatcherResult, MatcherState } from "vitest";
import { describeEvent, hint, MatcherInputError, show } from "../format";
import { isEventLog } from "../helpers/events";
import { isRunLog } from "../run-record";
import { isMemoryExporter } from "../telemetry";
import { RUN_RECORD } from "../run-record";

/** A place a value was found: the sink, where in it, and (for an event) which event. */
interface Hit {
  needle: string | RegExp;
  path: string;
  event?: string;
}

const MAX_DEPTH = 24;

/** What a walk saw: every string (and number) with its path, and where it had to stop. */
interface Walker {
  onString(text: string, path: string): void;
  /** Paths below {@link MAX_DEPTH}: not looked at, so "not found" cannot be claimed there. */
  tooDeep: string[];
  seen: WeakSet<object>;
}

const has = (name: string): boolean => typeof (globalThis as Record<string, unknown>)[name] === "function";
const key = (path: string, k: string): string => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`);

/**
 * Walk `value`, handing every string (and number) to the walker with its path. Cycles and DOM nodes are skipped. The
 * web's own containers are read through their API (a `URL`'s href, a `Request`'s url and headers, the entries of
 * `Headers`, `URLSearchParams` and `FormData`): their data is in no own enumerable property.
 */
function walk(value: unknown, path: string, w: Walker, depth = 0): void {
  if (typeof value === "string") {
    w.onString(value, path);
    return;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    w.onString(String(value), path);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (w.seen.has(value)) return;
  if (depth > MAX_DEPTH) {
    w.tooDeep.push(path);
    return;
  }
  w.seen.add(value);
  const next = (v: unknown, p: string) => walk(v, p, w, depth + 1);
  if (typeof Node !== "undefined" && value instanceof Node) return; // a control: its value is not data the sink kept
  if (value instanceof Error) {
    next(value.message, `${path}.message`);
    if (value.cause !== undefined) next(value.cause, `${path}.cause`);
    if (value instanceof AggregateError) next(value.errors, `${path}.errors`);
    for (const [k, v] of Object.entries(value)) if (k !== "message" && k !== "cause") next(v, key(path, k));
    return;
  }
  if (has("URL") && value instanceof URL) {
    next(value.href, `${path}.href`);
    return;
  }
  if (has("Request") && value instanceof Request) {
    next(value.url, `${path}.url`);
    next(value.headers, `${path}.headers`);
    return;
  }
  if (
    (has("Headers") && value instanceof Headers) ||
    (has("URLSearchParams") && value instanceof URLSearchParams) ||
    (has("FormData") && value instanceof FormData)
  ) {
    for (const [k, v] of (value as Headers).entries()) {
      next(k, `${path}.keys()`);
      // a FormData File: its name only (reading its bytes would be async)
      next(typeof v === "string" ? v : (v as File).name, `${path}.get(${show(k, 30)})`);
    }
    return;
  }
  if (value instanceof Map) {
    for (const [k, v] of value) {
      next(k, `${path}.keys()`);
      next(v, `${path}.get(${show(k, 30)})`);
    }
    return;
  }
  if (Array.isArray(value) || value instanceof Set) {
    for (const [i, v] of [...value].entries()) next(v, `${path}[${i}]`);
    return;
  }
  for (const [k, v] of Object.entries(value)) next(v, key(path, k));
}

const found = (text: string, needle: string | RegExp): boolean => {
  if (typeof needle === "string") return text.includes(needle);
  needle.lastIndex = 0; // a /g or /y RegExp would start where its last match ended
  return needle.test(text);
};

interface Spy {
  mock: { calls: unknown[][] };
  getMockName?: () => string;
}
const isSpy = (value: unknown): value is Spy =>
  (typeof value === "function" || typeof value === "object") && value !== null && Array.isArray((value as Spy).mock?.calls);

type Scan = { sink: string; hits: Hit[]; tooDeep: string[] };

/** Scan a sink that is already in memory (everything but a `Response`). */
function scan(received: unknown, needles: (string | RegExp)[]): Scan {
  const hits: Hit[] = [];
  const tooDeep: string[] = [];
  // one walker per walk (each event its own): an object two events share is found under both
  const check = (event?: string): Walker => ({
    onString: (text, path) => {
      for (const needle of needles) if (found(text, needle)) hits.push({ needle, path, ...(event ? { event } : {}) });
    },
    tooDeep,
    seen: new WeakSet<object>(),
  });
  const events = isEventLog(received) ? received.events : isEventArray(received) ? received : undefined;
  if (events) {
    // the event is named by its type and tool only: a fill's value is what is being looked for
    for (const [i, e] of events.entries()) walk(e, `events[${i}]`, check(describeEvent(e.type === "fill" ? { ...e, value: "…" } : e)));
    return { sink: "the event log", hits, tooDeep };
  }
  if (isRunLog(received)) {
    // each event is named by its type and tool only: inputs and outputs are what is being looked for
    for (const [i, e] of received.events.entries()) walk(e, `events[${i}]`, check(`${e.type}${"tool" in e ? ` ${e.tool}` : ""}`));
    return { sink: "the run log", hits, tooDeep };
  }
  if (isMemoryExporter(received)) {
    // each span is named by its name: attribute values are what is being looked for
    for (const [i, s] of received.spans.entries()) walk(s, `spans[${i}]`, check(s.name));
    return { sink: "the spans", hits, tooDeep };
  }
  if (isSpy(received)) {
    for (const [i, args] of received.mock.calls.entries()) walk(args, `calls[${i}]`, check());
    return { sink: `the spy "${received.getMockName?.() || "spy"}"`, hits, tooDeep };
  }
  const record = (received as Record<symbol, unknown> | null)?.[RUN_RECORD];
  if (record) {
    walk((received as { requests?: unknown }).requests, "requests", check());
    walk(record, "record", check());
    return { sink: "the mock adapter", hits, tooDeep };
  }
  walk(received, "value", check());
  return { sink: "the value", hits, tooDeep };
}

/** Scan a `Response`'s body: as JSON when it parses, else as text. */
async function scanResponse(res: Response, needles: (string | RegExp)[]): Promise<Scan> {
  const text = await res.clone().text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const scanned = json === undefined ? scan(text, needles) : scan(json, needles);
  return {
    sink: `the Response body (status ${res.status})`,
    tooDeep: scanned.tooDeep,
    hits: scanned.hits.map((h) => ({ ...h, path: json === undefined ? "body (text)" : h.path.replace(/^value/, "body") })),
  };
}

const isEventArray = (value: unknown): value is AgentEvent[] =>
  Array.isArray(value) && value.length > 0 && value.every((e) => typeof (e as AgentEvent | null)?.type === "string");

/**
 * One of `values` (strings found inside any text, or RegExps) is somewhere in this sink: an event log, a console spy
 * (`vi.spyOn(console, "error")`), a `Response` (its body), a mock adapter (what it was sent), a run, or any value.
 * Use it negated: `expect(sink).not.toContainSensitive(["A1234567"])`. The failure names the sink and the path where
 * the value was found, and prints nothing else of the sink's content. On a `Response` it is async: `await` it. A sink
 * nested deeper than it looks (24 levels) fails with the path where it stopped, unless a value was found: "not there"
 * is never claimed for a part it did not read.
 *
 * @example
 * for (const sink of [events, logs, adapter]) expect(sink).not.toContainSensitive(["A1234567"]);
 * await expect(response).not.toContainSensitive(["sk-test-key"]);
 */
export function toContainSensitive(this: MatcherState, received: unknown, values: (string | RegExp)[]): MatcherResult {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    !values.every((v) => (typeof v === "string" && v.length > 0) || v instanceof RegExp)
  ) {
    throw new MatcherInputError(
      `toContainSensitive takes a non-empty list of the values to look for (strings or RegExps), got ${show(values)}.`,
    );
  }
  if (received === undefined) {
    throw new MatcherInputError(
      "toContainSensitive needs a sink to look in (an event log, a spy, a Response, a mock adapter or a value), got undefined.",
    );
  }
  const head = hint(this, "toContainSensitive", [values]);
  const verdict = ({ sink, hits, tooDeep }: Scan): MatcherResult => {
    // nothing found, but not everything read: neither "there" nor "not there" holds
    if (!hits.length && tooDeep.length)
      throw new MatcherInputError(
        `toContainSensitive could not read all of ${sink}: it stops ${MAX_DEPTH} levels down, at ${tooDeep
          .slice(0, 3)
          .join(", ")}${tooDeep.length > 3 ? ` and ${tooDeep.length - 3} more` : ""}. Pass the nested part itself.`,
      );
    return {
      pass: hits.length > 0,
      message: () =>
        this.isNot
          ? `${head}\n\n  Found in ${sink}:\n${hits
              .slice(0, 10)
              .map((h) => `  - ${show(h.needle)} at ${h.path}${h.event ? ` (event: ${h.event})` : ""}`)
              .join("\n")}${hits.length > 10 ? `\n  … and ${hits.length - 10} more` : ""}`
          : `${head}\n\n  Expected ${sink} to contain one of ${values.map((v) => show(v)).join(", ")}, but none is in it.`,
    };
  };
  if (typeof Response !== "undefined" && received instanceof Response) return scanResponse(received, values).then(verdict);
  return verdict(scan(received, values));
}
