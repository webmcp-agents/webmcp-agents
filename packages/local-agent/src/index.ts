/**
 * @webmcp-agents/local-agent: an on-device AgentAdapter for @webmcp-agents/chat. No server, no key; nothing the user
 * types leaves the browser.
 *
 *   <AgentChat adapters={[createCloudAdapter(), createLocalAdapter()]} />
 *
 * Providers, first available wins: Chrome's built-in model (Prompt API), then a small Qwen3 model run by
 * transformers.js in a Web Worker (WebGPU, or WASM with a smaller model). A model download starts only from
 * `prepare()`, i.e. the person's click in the chat's download card.
 */
import type { AdapterStatus, AgentAdapter, AgentRunRequest, AgentStreamPart } from "@webmcp-agents/chat";
import { type LocalLoopOptions, runLocalAgent } from "./loop";
import { createPromptApiProvider } from "./providers/prompt-api/provider";
import { BUSY, createTransformersProvider, type TransformersProviderOptions } from "./providers/transformers/provider";
import type { LocalProvider, ProviderAvailability } from "./types";

/** Options for `createLocalAdapter`. */
/** `instructions` and `maxSteps` are fallbacks: the page's WebAgent (`<AgentChat agent>`) wins when it sets them. */
export interface LocalAdapterOptions extends Pick<LocalLoopOptions, "maxSteps" | "stepTimeoutMs" | "instructions"> {
  /** Engines to try, in order. Default: Chrome's Prompt API, then transformers.js. */
  providers?: LocalProvider[];
  /** transformers.js model id to start with (default: Qwen3 0.6B ONNX; "onnx-community/Qwen3-1.7B-ONNX" needs more memory). */
  model?: string;
  /** Models the person may pick from in the chat, each with a brief and its size. Default: just `model`. */
  models?: TransformersProviderOptions["models"];
  /** Quantization. Default: q4f16 on WebGPU with f16 shaders, q4 otherwise. */
  dtype?: TransformersProviderOptions["dtype"];
  /** The transformers.js worker, when your bundler can't resolve the package's own (see the README). */
  worker?: TransformersProviderOptions["worker"];
  /** Shown in the chat's adapter switcher. Default "On-device". */
  label?: string;
}

const STATUS_LOADING: AdapterStatus = { state: "loading" };

/** Each provider's availability right now, e.g. for a settings screen. */
export async function detectLocalProviders(
  providers: readonly LocalProvider[] = [createPromptApiProvider(), createTransformersProvider()],
): Promise<Array<{ id: string; availability: ProviderAvailability }>> {
  return Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      availability: await p.availability().catch((e) => ({ state: "unavailable" as const, reason: String(e) })),
    })),
  );
}

/** An AgentAdapter that runs a model in this browser. Create it once per page. */
export function createLocalAdapter(opts: LocalAdapterOptions = {}): AgentAdapter {
  const providers = opts.providers ?? [
    createPromptApiProvider(),
    createTransformersProvider({ model: opts.model, models: opts.models, dtype: opts.dtype, worker: opts.worker }),
  ];
  let status: AdapterStatus = STATUS_LOADING;
  let provider: LocalProvider | null = null;
  let detecting: Promise<void> | null = null;
  let preparing: Promise<void> | null = null;
  /** A reply is being generated (no model switch meanwhile). */
  let running = false;
  /** The provider's model is in the browser cache but not loaded: "ready", loaded by the first run. */
  let lazy = false;
  const listeners = new Set<() => void>();
  const set = (next: AdapterStatus): void => {
    status = next;
    for (const l of listeners) l();
  };

  const fromAvailability = (a: ProviderAvailability): AdapterStatus =>
    a.state === "available" || (a.state === "needs-download" && a.cached)
      ? { state: "ready" }
      : a.state === "needs-download"
        ? { state: "needs-download", bytes: a.bytes, note: a.note }
        : a.state === "downloading"
          ? // nothing reports progress until prepare() follows it: offer the click that does
            { state: "needs-download", note: "Already downloading in the background: continue to follow its progress." }
          : { state: "unavailable", reason: a.reason };

  /** The first provider that is ready, else the first that can download, else unavailable. */
  const detect = (): Promise<void> =>
    (detecting ??= (async () => {
      const usable = providers.filter((p) => !p.broken);
      const found = await detectLocalProviders(usable);
      const pick = (state: ProviderAvailability["state"]) => found.findIndex((f) => f.availability.state === state);
      const index = [pick("available"), pick("downloading"), pick("needs-download")].find((i) => i !== -1);
      if (index === undefined) {
        const reason = found.map((f) => (f.availability.state === "unavailable" ? f.availability.reason : "")).find(Boolean);
        return set({ state: "unavailable", reason: reason ?? "No on-device model can run in this browser." });
      }
      provider = usable[index]!;
      const availability = found[index]!.availability;
      lazy = availability.state === "needs-download" && !!availability.cached;
      set(fromAvailability(availability));
    })());

  return {
    id: "local",
    label: opts.label ?? "On-device",
    status() {
      if (typeof window !== "undefined") void detect();
      return status;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    models() {
      return provider?.models?.() ?? [];
    },
    async selectModel(id) {
      await detect();
      const p = provider;
      if (!p?.selectModel) throw new Error("This assistant runs one model.");
      if (running || status.state === "downloading" || (status.state === "loading" && status.progress !== undefined)) throw new Error(BUSY);
      await p.selectModel(id);
      // start over for the new model: it may need a download, or be on the device already
      detecting = null;
      preparing = null;
      lazy = false;
      set(STATUS_LOADING);
      await detect();
    },
    prepare(signal?: AbortSignal) {
      preparing ??= (async () => {
        try {
          await detect();
          const p = provider;
          if (!p || (status.state === "ready" && !lazy) || status.state === "unavailable" || signal?.aborted) return;
          const before = status;
          // a model already on this device is read from disk, never "downloaded" again: say so
          const state = lazy ? "loading" : "downloading";
          set({ state, progress: 0 });
          try {
            await p.prepare((progress) => set({ state, progress }), signal);
            lazy = false;
            set({ state: "ready" });
          } catch (err) {
            const cancelled = (err as { name?: string })?.name === "AbortError";
            set(
              cancelled
                ? before
                : { state: "error", error: `The model couldn't load: ${err instanceof Error ? err.message : String(err)}` },
            );
            if (!cancelled) throw err;
          }
        } finally {
          preparing = null; // every outcome: the next click starts afresh
        }
      })();
      return preparing;
    },
    async *run(req: AgentRunRequest): AsyncGenerator<AgentStreamPart> {
      if (status.state !== "ready" || !provider) {
        return yield { type: "error", error: "The on-device model isn't ready: download it first." };
      }
      // cached from an earlier visit: load it now (the chat shows the progress), no Download click again
      if (lazy) {
        try {
          await this.prepare!(req.signal);
        } catch {
          return; // the status carries the error (or the cancel)
        }
        if (status.state !== "ready" || !provider) return;
      }
      const current = provider;
      // a step's opening parts (step-start, message-start) wait for its first content: a provider that fails to start
      // leaves no empty bubble and no empty step behind
      let held: AgentStreamPart[] = [];
      running = true;
      try {
        for await (const part of runLocalAgent(current, req, {
          maxSteps: opts.maxSteps,
          stepTimeoutMs: opts.stepTimeoutMs,
          toolsInline: current.toolsInline,
          instructions: opts.instructions,
        })) {
          // Chrome's model reported "available" but can't start: drop it and answer with the next provider instead
          if (part.type === "error" && current.broken) break;
          if (part.type === "message-start" || part.type === "step-start") {
            held.push(part);
            continue;
          }
          yield* held;
          held = [];
          yield part;
        }
      } finally {
        running = false;
      }
      if (!current.broken) {
        yield* held;
        return;
      }
      provider = null;
      detecting = null;
      set(STATUS_LOADING);
      await detect();
      if (status.state === "ready") return yield* this.run(req); // e.g. the downloadable model, cached: loads and answers
      const messageId = `local-${Date.now()}`;
      yield { type: "message-start", messageId };
      yield {
        type: "text-delta",
        messageId,
        delta: "Chrome's built-in model can't run on this device. Download the on-device model below, then send your message again.",
      };
      yield { type: "finish", reason: "stop" };
    },
  };
}

export { runLocalAgent } from "./loop";
export type { LocalLoopOptions } from "./loop";
export { createPromptApiProvider } from "./providers/prompt-api/provider";
export {
  BUSY,
  createTransformersProvider,
  DEFAULT_CPU_MODEL,
  DEFAULT_GPU_MODEL,
  DEFAULT_MODEL,
  MODELS,
} from "./providers/transformers/provider";
export type { ModelInfo, TransformersProviderOptions } from "./providers/transformers/provider";
export { createProseFilter, parseToolCalls } from "./tool-call-parser";
export type { ParsedCall, ParseResult } from "./tool-call-parser";
export { compactSchema, rankTools, validateArgs } from "./tools";
export type * from "./types";
