import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import type { MockLanguageModelV4 } from "ai/test";

/** The options of one model call, as `ai/test` records them (no direct dependency on @ai-sdk/provider's types). */
type CallOptions = MockLanguageModelV4["doStreamCalls"][number];
import { nextId } from "../ids";
import { chunksOf, type Step, type StepInput, toStep } from "../script";

/** What the model was sent on one call: the tools it was offered and the prompt. */
export interface MockModelCall {
  /** The tools offered, as the AI SDK passes them to a provider (`{ type, name, description, inputSchema }`). */
  tools: NonNullable<CallOptions["tools"]>;
  /** The prompt: system, user, assistant and tool messages. */
  prompt: CallOptions["prompt"];
  /** Every option of the call (temperature, provider options, abort signal…). */
  options: CallOptions;
}

/** A scripted AI SDK model (`MockLanguageModelV4` from `ai/test`) that remembers its calls. */
export type MockModel = MockLanguageModelV4 & {
  /** Every call, in order. */
  readonly calls: MockModelCall[];
};

/** The Mock class from `ai/test`, handed over by the entry once the optional peer is loaded. */
let MockClass: (new (options: ConstructorParameters<typeof MockLanguageModelV4>[0]) => MockLanguageModelV4) | undefined;
let convert: (<T>(parts: T[]) => ReadableStream<T>) | undefined;

/** @internal The entry calls this with `ai/test` after loading it. */
export function provideAiTest(mod: {
  MockLanguageModelV4: typeof MockLanguageModelV4;
  convertArrayToReadableStream: <T>(p: T[]) => ReadableStream<T>;
}): void {
  MockClass = mod.MockLanguageModelV4;
  convert = mod.convertArrayToReadableStream;
}

/** The stream parts of one step, as a provider would send them. */
function partsFor(step: Step): LanguageModelV4StreamPart[] {
  const usage = step.usage ?? {};
  const inputTokens = usage.inputTokens ?? 10;
  const outputTokens = usage.outputTokens ?? 5;
  const parts: LanguageModelV4StreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (step.error) {
    parts.push({ type: "error", error: Object.assign(new Error(step.error.message ?? "Failed."), { code: step.error.code }) });
    return parts;
  }
  if (step.reasoning) {
    parts.push(
      { type: "reasoning-start", id: "r1" },
      { type: "reasoning-delta", id: "r1", delta: step.reasoning.text },
      { type: "reasoning-end", id: "r1", providerMetadata: { anthropic: { signature: step.reasoning.signature ?? "sig" } } },
    );
  }
  if (step.text) {
    parts.push({ type: "text-start", id: "t1" });
    for (const delta of chunksOf(step.text, step.chunks)) parts.push({ type: "text-delta", id: "t1", delta });
    parts.push({ type: "text-end", id: "t1" });
  }
  for (const c of step.calls ?? []) {
    parts.push({ type: "tool-call", toolCallId: c.id ?? nextId("call"), toolName: c.name, input: JSON.stringify(c.input ?? {}) });
  }
  parts.push({
    type: "finish",
    usage: {
      inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
    },
    finishReason: { unified: step.calls?.length ? "tool-calls" : "stop", raw: undefined },
  });
  return parts;
}

/**
 * A model that plays `steps`, one per call (the last one repeats), for `createChatHandler({ model })`: the endpoint
 * runs with no provider key and no network. `model.calls[n]` is what call `n` was offered and sent. `mockModel([])`
 * is a model that must never be called: a call fails with a sentence saying so.
 *
 * @example
 * const model = mockModel([toolCall("add_to_cart", { id: "mug-01" }), text("Added.")]);
 * const handler = createChatHandler({ model });
 * // … send a request …
 * expect(model.calls[0].tools.map((t) => t.name)).toEqual(["add_to_cart"]);
 */
export function mockModel(steps: StepInput[]): MockModel {
  if (!MockClass || !convert) throw new Error("mockModel() needs ai: import it from @webmcp-agents/testing/server.");
  if (!Array.isArray(steps)) {
    throw new TypeError('mockModel() takes a list of steps, e.g. [toolCall("add_to_cart"), text("Added.")].');
  }
  const toStream = convert;
  let i = 0;
  const model = new MockClass({
    doStream: async () => {
      // an empty script is a model that must never be called (a guard should have answered first)
      if (!steps.length) throw new Error("mockModel([]) was called: it has no steps, so the test expected no model call.");
      const step = toStep(steps[Math.min(i++, steps.length - 1)]!);
      return { stream: toStream(partsFor(step)) };
    },
  });
  Object.defineProperty(model, "calls", {
    get: (): MockModelCall[] => model.doStreamCalls.map((options) => ({ tools: options.tools ?? [], prompt: options.prompt, options })),
  });
  return model as MockModel;
}
