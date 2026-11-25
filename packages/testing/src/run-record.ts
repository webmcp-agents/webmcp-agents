/**
 * The run matchers (`toHaveCalledTool(s)`, `toHaveAnswered`, `toHaveFinishedWith`, `toHaveBeenOfferedTools`) read a
 * run from three places: a `WebAgentResult` (what `agent.invoke` resolved to), a `mockAdapter` (which saw every part
 * it streamed), or the error `agent.invoke` rejected with. The `runs` fixture's `RunLog` joins them in phase 4.
 */
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

/** A run as the matchers see it. */
export interface ReadRun {
  /** "a WebAgentResult", "the mock adapter", "the error agent.invoke rejected with". */
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
  if ((received as { events?: unknown } | null)?.events !== undefined && matcher !== "toHaveBeenOfferedTools") {
    throw new MatcherInputError(
      `${matcher} cannot read a RunLog yet: run events arrive in phase 4 of 0.5.0. Pass the WebAgentResult or the mockAdapter.`,
    );
  }
  throw new MatcherInputError(
    `${matcher} needs a run: the WebAgentResult agent.invoke resolved to, a mockAdapter, or the error agent.invoke rejected with; got ${kindOf(received)}.`,
  );
}
