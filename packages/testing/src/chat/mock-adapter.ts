import type { AgentAdapter, AgentMessage, AgentRunRequest, AgentStreamPart, RunRef, ToolDescriptor, WebAgent } from "@webmcp-agents/chat";
import { type Mock, vi } from "vitest";
import { nextId } from "../ids";
import { type RecordedFinish, RUN_RECORD, type RunRecord } from "../run-record";
import { chunksOf, type Step, type StepInput, toStep } from "../script";

/** Where a scripted function is called from: which run of the adapter, which model step of it. */
export interface MockTurn {
  /** The adapter's run, from 1 (each `agent.invoke`, each chat message, each sub-agent run is one). */
  run: number;
  /** The model step within the run, from 1. */
  step: number;
}

/**
 * What a function script returns for a model step: a step (or steps merged into one), `undefined` when it has
 * nothing more to say (the run fails with a sentence), or a whole stream of parts (the run is that stream: for
 * behavior no step can express, e.g. waiting on `req.signal`).
 */
export type MockStepResult = StepInput | undefined | AsyncIterable<AgentStreamPart>;

/**
 * The script: steps played in order across runs (a run takes steps until one has no tool calls), or a function
 * called for every model step.
 */
export type MockScript = StepInput[] | ((req: AgentRunRequest, turn: MockTurn) => MockStepResult | Promise<MockStepResult>);

/** Options for {@link mockAdapter}. */
export interface MockAdapterOptions {
  /** The adapter's id. Default `"mock"`. */
  id?: string;
  /** Its label in the adapter switcher. Default `"Mock"`. */
  label?: string;
  /**
   * Report each step's token usage on its `step-finish` part, as the cloud adapter does when the server sends it: the
   * step's `usage`, or `{ inputTokens: 10, outputTokens: 5 }`. `false` reports none, like an on-device adapter.
   * Default true.
   */
  usage?: boolean;
  /** The model id each `step-finish` reports (with `usage`). Default `"mock/model"`. */
  model?: string;
}

/** A request as the adapter received it: the messages copied at that moment, the tools as they were offered. */
export interface MockRequest {
  messages: AgentMessage[];
  tools: ToolDescriptor[];
  agent?: WebAgent;
  signal: AbortSignal;
  /** The run's ids (`conversation`, `run`, `parent` for a sub-agent's run), as the cloud adapter would send them. */
  ref?: RunRef;
}

/** A model-free `AgentAdapter` that plays a script, and remembers what it was sent and what it did. */
export type MockAdapter = AgentAdapter & {
  /** `run`, as a spy. */
  run: Mock<(req: AgentRunRequest) => AsyncIterable<AgentStreamPart>>;
  /** Every request, in order (sub-agent runs included). */
  readonly requests: MockRequest[];
  /** The signal of the last run. */
  readonly lastSignal: AbortSignal | undefined;
  /** Every tool call it made, every run, in order. */
  readonly calls: RunRecord["calls"];
  /** What it remembers for the matchers. */
  readonly [RUN_RECORD]: RunRecord;
};

const abortable = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (!ms || signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const isStream = (value: unknown): value is AsyncIterable<AgentStreamPart> =>
  typeof value === "object" && value !== null && Symbol.asyncIterator in value;

const copy = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
};

/**
 * An adapter that runs a script instead of a model: no network, no key. It owns the loop like a real adapter: a tool
 * call step runs the call on the page (`req.callTool`, cursor and all), then the next step follows; a step without
 * calls answers and ends the run. The run matchers (`toHaveCalledTools`, `toHaveAnswered`, `toHaveFinishedWith`,
 * `toHaveBeenOfferedTools`) read it.
 *
 * @example
 * const adapter = mockAdapter([toolCall("track_last_order"), toolCall("add_to_cart", { qty: 2 }), text("Done.")]);
 * const run = await shopper.invoke("Reorder my last purchase.", { adapter });
 * expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);
 * @example
 * mockAdapter([fail("rate_limited")]);                       // the run fails with that code
 * mockAdapter((req) => (req.tools.some((t) => t.name === "place_order") ? toolCall("place_order") : text("Nothing to order.")));
 */
export function mockAdapter(script: MockScript, options: MockAdapterOptions = {}): MockAdapter {
  if (!Array.isArray(script) && typeof script !== "function") {
    throw new TypeError("mockAdapter() takes a list of steps (text(), toolCall(), fail()…) or a function that returns one per model step.");
  }
  const record: RunRecord = { calls: [], answers: [], finishes: [], offered: [], top: -1 };
  const requests: MockRequest[] = [];
  let cursor = 0;
  let runs = 0;
  let lastSignal: AbortSignal | undefined;

  const next = async (req: AgentRunRequest, turn: MockTurn): Promise<MockStepResult> => {
    if (typeof script === "function") return script(req, turn);
    return script[cursor++];
  };

  /** Record what flows through, whatever produced it. */
  async function* observe(parts: AsyncIterable<AgentStreamPart>, run: number): AsyncGenerator<AgentStreamPart> {
    for await (const part of parts) {
      if (part.type === "tool-call") record.calls.push({ name: part.name, input: part.input });
      if (part.type === "text-delta") record.answers[run - 1] = (record.answers[run - 1] ?? "") + part.delta;
      if (part.type === "finish") record.finishes[run - 1] = { reason: part.reason };
      if (part.type === "error")
        record.finishes[run - 1] = { reason: "error", error: part.error, ...(part.code ? { code: part.code } : {}) };
      yield part;
    }
  }

  async function* play(req: AgentRunRequest, run: number): AsyncGenerator<AgentStreamPart> {
    const finish = (f: RecordedFinish): AgentStreamPart =>
      f.reason === "error"
        ? { type: "error", error: f.error ?? "Failed.", ...(f.code ? { code: f.code as never } : {}) }
        : { type: "finish", reason: f.reason };
    const max = req.agent?.maxSteps ?? Number.POSITIVE_INFINITY;
    for (let stepNo = 1; ; stepNo++) {
      const tools = req.tools; // a getter: read fresh for every step
      record.offered.push(tools.map((t) => t.name));
      const result = await next(req, { run, step: stepNo });
      if (isStream(result)) {
        if (stepNo > 1) throw new TypeError("mockAdapter: a script function may return a stream of parts only for a run's first step.");
        yield* result;
        return;
      }
      // a whole stream (above) frames its own steps, or leaves them to the run's tracker
      yield { type: "step-start", step: stepNo };
      if (result === undefined) {
        const scripted = Array.isArray(script) ? `was scripted with ${script.length} step(s) and ` : "";
        yield finish({
          reason: "error",
          error: `mockAdapter ran out of steps: it ${scripted}was asked for one more (run ${run}, step ${stepNo}). End a run with a step without tool calls, e.g. text("Done.").`,
        });
        return;
      }
      const step: Step = toStep(result);
      if (step.error) {
        yield finish({ reason: "error", error: step.error.message ?? "Failed.", ...(step.error.code ? { code: step.error.code } : {}) });
        return;
      }
      const messageId = nextId("a");
      yield { type: "message-start", messageId };
      const usage = options.usage === false ? undefined : { inputTokens: 10, outputTokens: 5, ...step.usage };
      if (step.reasoning) {
        yield {
          type: "reasoning",
          messageId,
          text: step.reasoning.text,
          ...(step.reasoning.signature ? { providerMetadata: { anthropic: { signature: step.reasoning.signature } } } : {}),
        };
      }
      for (const delta of step.text ? chunksOf(step.text, step.chunks) : []) {
        await abortable(step.delayMs ?? 0, req.signal);
        if (req.signal.aborted) break;
        yield { type: "text-delta", messageId, delta };
      }
      // the reply (its calls announced), then the end of the step (its usage), then the calls run: as the cloud adapter
      const calls = req.signal.aborted
        ? []
        : (step.calls ?? []).map((call) => ({ id: call.id ?? nextId("call"), name: call.name, input: call.input ?? {} }));
      for (const call of calls) yield { type: "tool-call", messageId, ...call };
      if (!req.signal.aborted) yield { type: "step-finish", step: stepNo, ...(usage && { usage, model: options.model ?? "mock/model" }) };
      for (const call of calls) {
        if (req.signal.aborted) break;
        const output = await req.callTool(call);
        yield { type: "tool-result", id: call.id, output };
      }
      if (req.signal.aborted) {
        yield finish({ reason: "aborted" });
        return;
      }
      if (!calls.length) {
        yield finish({ reason: "stop" });
        return;
      }
      if (stepNo >= max) {
        yield finish({ reason: "max-steps" });
        return;
      }
    }
  }

  const run = vi.fn((req: AgentRunRequest): AsyncIterable<AgentStreamPart> => {
    const n = ++runs;
    lastSignal = req.signal;
    requests.push({
      messages: copy(req.messages),
      tools: [...req.tools],
      ...(req.agent ? { agent: req.agent } : {}),
      signal: req.signal,
      ...(req.ref ? { ref: { ...req.ref } } : {}),
    });
    record.answers[n - 1] = undefined;
    record.finishes[n - 1] = undefined;
    // a sub-agent's run (`ref.parent`) is not the one the run matchers read
    if (!req.ref?.parent) record.top = n - 1;
    return observe(play(req, n), n);
  });

  return {
    id: options.id ?? "mock",
    label: options.label ?? "Mock",
    run,
    requests,
    get lastSignal() {
      return lastSignal;
    },
    get calls() {
      return record.calls;
    },
    [RUN_RECORD]: record,
  };
}
