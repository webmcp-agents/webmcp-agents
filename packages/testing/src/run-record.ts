/**
 * The run matchers (`toHaveCalledTool(s)`, `toHaveAnswered`, `toHaveFinishedWith`, `toHaveBeenOfferedTools`) read a
 * run from four places: a `WebAgentResult` (what `agent.invoke` resolved to), a `mockAdapter` (which saw every part
 * it streamed), the error `agent.invoke` rejected with, or the `runs` fixture's `RunLog` (every run event).
 */
import type { AgentRunEvent } from "@webmcp-agents/chat";
import { kindOf, MatcherInputError } from "./format";

/** How a run ended, as the chat's `finish` / `error` parts say it. */
export type FinishReason = "stop" | "max-steps" | "aborted" | "error";

/** One tool call a run made. */
export interface RecordedCall {
  name: string;
  input: unknown;
  /** The sub-agent that made it, when not the agent itself. */
  agent?: string;
}

/** How one run ended. */
export interface RecordedFinish {
  reason: FinishReason;
  /** The adapter's error code (`rate_limited`, `network`…), when it gave one. */
  code?: string;
  /** The error's text, when it failed. */
  error?: string;
}

/** What a mock adapter remembers of its runs. */
export interface RunRecord {
  /** Every tool call, every run, in order. */
  readonly calls: RecordedCall[];
  /** The text each run streamed, joined, in run order. */
  readonly answers: string[];
  /** How each run ended, in order (undefined while a run is in flight). */
  readonly finishes: (RecordedFinish | undefined)[];
  /** The tool names offered on each model step, in order. */
  readonly offered: string[][];
}

/** Where a mock adapter keeps its {@link RunRecord}. */
export const RUN_RECORD: unique symbol = Symbol.for("web-agents.testing.run-record") as never;

/** Marks an object as a {@link RunLog}, so matchers can tell it from any `{ events }`. */
export const RUN_LOG: unique symbol = Symbol.for("web-agents.testing.run-log") as never;

/** Options for `recordRuns`. */
export interface RunLogOptions {
  /** Record tool inputs and outputs as they are, without the page's redaction. Default false (what a listener sees by default). */
  raw?: boolean;
}

/**
 * Every `AgentRunEvent` since recording started, in order (the `runs` fixture, or `recordRuns()` from
 * `@webmcp-agents/testing/chat`). The run matchers read it: the calls (`tool-start`), and how the last top-level run
 * ended (`run-finish`, which tells `"max-steps"` from `"stop"`). It holds no answer text: `toHaveAnswered` needs the
 * `WebAgentResult` or the `mockAdapter`.
 */
export interface RunLog {
  /** The run events so far (the same array grows while recording). */
  readonly events: readonly AgentRunEvent[];
  /** Their types, in order: `["run-start", "step-start", "step-finish", "run-finish"]`. */
  types(): AgentRunEvent["type"][];
  /** The events of one run, by its id (`ref.run`). */
  of(run: string): AgentRunEvent[];
  /** The ids of the runs that started, in order, sub-agents' included. */
  runIds(): string[];
  /** Forget what was recorded so far; keep recording. */
  clear(): void;
  /** Stop recording. Idempotent. The `runs` fixture stops for you. */
  stop(): void;
}

/** True for a log made by `recordRuns` (the `runs` fixture). */
export const isRunLog = (value: unknown): value is RunLog =>
  typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[RUN_LOG] === true;

/** A run log as the matchers see it: every call, and how the last top-level run ended. */
function readRunLog(log: RunLog): ReadRun {
  const agents = new Map<string, string>();
  const calls: RecordedCall[] = [];
  let finish: RecordedFinish | undefined;
  for (const e of log.events) {
    if (e.type === "run-start" && e.ref.parent && e.agent) agents.set(e.ref.run, e.agent);
    else if (e.type === "tool-start") {
      const agent = agents.get(e.ref.run);
      calls.push({ name: e.tool, input: e.input, ...(agent ? { agent } : {}) });
    } else if (e.type === "run-finish" && !e.ref.parent) {
      finish = { reason: e.reason, ...(e.code ? { code: e.code } : {}), ...(e.error ? { error: e.error } : {}) };
    }
  }
  return { source: "the run log", calls, finish };
}

/** A run as the matchers see it. */
export interface ReadRun {
  /** "the WebAgentResult", "the mock adapter", "the error agent.invoke rejected with", "the run log". */
  source: string;
  calls: RecordedCall[];
  answer?: string;
  finish?: RecordedFinish;
  /** Set when the source cannot tell stop from max-steps. */
  finishNote?: string;
  offered?: string[][];
}

interface WebAgentResultLike {
  text: string;
  steps: { tool: string; input: unknown; agent?: string }[];
  messages: unknown[];
}

const isWebAgentResult = (value: unknown): value is WebAgentResultLike =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as WebAgentResultLike).text === "string" &&
  Array.isArray((value as WebAgentResultLike).steps) &&
  Array.isArray((value as WebAgentResultLike).messages);

/** Read a run, or throw a sentence saying what the matcher needs. */
export function readRun(received: unknown, matcher: string): ReadRun {
  const record = (received as { [RUN_RECORD]?: RunRecord } | null)?.[RUN_RECORD];
  if (record) {
    return {
      source: "the mock adapter",
      calls: record.calls,
      answer: record.answers.at(-1),
      finish: record.finishes.at(-1),
      offered: record.offered,
    };
  }
  if (isWebAgentResult(received)) {
    return {
      source: "the WebAgentResult",
      calls: received.steps.map((s) => ({ name: s.tool, input: s.input, ...(s.agent ? { agent: s.agent } : {}) })),
      answer: received.text,
      finish: { reason: "stop" },
      finishNote:
        'agent.invoke resolved, which reads as "stop"; a run cut short by maxSteps resolves too. To tell them apart, assert on the mockAdapter.',
    };
  }
  if (received instanceof Error) {
    const aborted = received.name === "AbortError";
    const code = (received as Error & { code?: unknown }).code;
    return {
      source: "the error agent.invoke rejected with",
      calls: [],
      finish: { reason: aborted ? "aborted" : "error", ...(typeof code === "string" ? { code } : {}), error: received.message },
    };
  }
  if (isRunLog(received)) {
    if (matcher === "toHaveAnswered")
      throw new MatcherInputError(
        "toHaveAnswered cannot read a RunLog: run events carry no answer text. Pass the WebAgentResult agent.invoke resolved to, or the mockAdapter.",
      );
    return readRunLog(received);
  }
  throw new MatcherInputError(
    `${matcher} needs a run: the WebAgentResult agent.invoke resolved to, a mockAdapter, the runs fixture's RunLog, or the error agent.invoke rejected with; got ${kindOf(received)}.`,
  );
}
