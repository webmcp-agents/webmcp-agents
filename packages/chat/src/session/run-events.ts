/**
 * Run events: what happened in one agent run (a chat turn, a `useWebAgent` / `agent.invoke` call, a sub-agent's run),
 * as plain events any code on the page can subscribe to with `onAgentRun`. `@webmcp-agents/telemetry` builds its
 * browser spans from them; an app can send them to its own analytics with no telemetry package at all.
 *
 * Pure and React-free: `runAgent` emits, listeners subscribe. Every event carries the run's {@link RunRef}, the ids the
 * cloud adapter also sends with each step request (`trace` in the body, a `traceparent` header), so browser events and
 * server spans of one run join up.
 */
import { getRegisteredWebTool } from "@webmcp-agents/core";
import { getRedactor, toolSensitivity } from "@webmcp-agents/core/redact";
import type { ToolOutput } from "../types";

/**
 * Which run an event belongs to. The same ids travel with every step request of the run (`trace` in the body), so the
 * server's spans carry them too.
 *
 * @experimental Part of the run telemetry introduced in 0.5.0; field names may still change in a minor release.
 */
export interface RunRef {
  /** The conversation: the same for every turn of one chat (kept across a reload and a restore; a new chat gets a new one). */
  conversation: string;
  /** This run: one user turn, one `agent.invoke`, or one sub-agent run. */
  run: string;
  /** For a sub-agent's run: the id of the `delegate_to_<id>` call that started it. */
  parent?: string;
  /**
   * The run's W3C trace context (`00-<trace id>-<span id>-<flags>`): sent as the `traceparent` header of every step
   * request, so the server's step spans sit under this run. A sub-agent's run shares its parent's trace id. The flags
   * are `01` (sampled) only while {@link RunRef.sampled} is true, else `00`; it is read when each request is sent.
   */
  traceparent?: string;
  /**
   * Whether something on the page records this run's span, so the server may hang its step spans under it (the
   * `traceparent`'s sampled flag). Default false: the server then keeps its own root span, rather than pointing at a
   * parent no backend will ever receive. A listener that records the run sets it to true when it gets `run-start`,
   * which is delivered before the run's first step request is built (`@webmcp-agents/telemetry`'s `observeAgents` does,
   * once consent and its sampling keep the run). A sub-agent's run starts with its parent's value.
   */
  sampled?: boolean;
}

/**
 * Token usage of one model step, as the server reports it (`createChatHandler({ telemetry: { usageToClient } })`).
 * Every field is optional: a provider reports what it knows.
 *
 * @experimental
 */
export interface StepUsage {
  /** Prompt tokens, cached ones included. */
  inputTokens?: number;
  /** Generated tokens, reasoning included. */
  outputTokens?: number;
  /** Of `outputTokens`, the ones spent reasoning. */
  reasoningTokens?: number;
  /** Of `inputTokens`, the ones read from the provider's prompt cache. */
  cachedInputTokens?: number;
  /** All tokens of the step. */
  totalTokens?: number;
}

/**
 * One thing that happened in a run, in order: `run-start`, then per model step `step-start` … `step-finish`, then per
 * tool call `tool-start` (`tool-park`, `tool-yield` while it runs) … `tool-finish`, and last `run-finish`. A sub-agent's
 * events sit between its delegate call's `tool-start` and `tool-finish`, with `ref.parent` set to that call. Times
 * (`at`) are `performance.now()`; durations are milliseconds.
 *
 * `input` and `output` are redacted with the page's redactor (`configureRedaction`, and the tool's own `sensitive`
 * fields) unless the listener subscribed with `{ raw: true }`.
 *
 * @experimental
 */
export type AgentRunEvent =
  /** A run began. `adapter`: the adapter's id ("cloud", "local"…); `agent`: the agent's id, when one runs. */
  | { type: "run-start"; ref: RunRef; agent?: string; adapter: string; at: number }
  /** A model step began. `step` counts from 1 within the run; `tools`: how many tools the model was offered. */
  | { type: "step-start"; ref: RunRef; step: number; tools: number; at: number }
  /**
   * A model step ended. `ms`: from `step-start`; `firstTokenMs`: until the first text, reasoning or tool call arrived;
   * `usage` and `model`: what the server reported (absent from an on-device run, or with `usageToClient: false`);
   * `toolCalls`: how many tools the step called.
   */
  | {
      type: "step-finish";
      ref: RunRef;
      step: number;
      ms: number;
      firstTokenMs?: number;
      model?: string;
      usage?: StepUsage;
      toolCalls: number;
    }
  /** A tool call began running on the page (or, for `delegate_to_<id>`, a sub-agent's run). `input`: what the model sent. */
  | { type: "tool-start"; ref: RunRef; step: number; call: string; tool: string; at: number; input?: unknown }
  /** The call is waiting for the person (a confirm-gated submit). `prompt`: what they are asked to do. */
  | { type: "tool-park"; ref: RunRef; call: string; tool: string; prompt: string; at: number }
  /** The person interacted with the page while the call ran, and the cursor got out of the way. */
  | { type: "tool-yield"; ref: RunRef; call: string; reason: string; at: number }
  /**
   * The call ended. `ms`: from `tool-start`; `waitedMs`: of that, the time spent parked for the person; `state`: how it
   * ended (`cancelled` when the run was stopped or the person cancelled); `code`: the error code of a failed call.
   */
  | {
      type: "tool-finish";
      ref: RunRef;
      call: string;
      tool: string;
      ms: number;
      waitedMs: number;
      state: "done" | "error" | "cancelled";
      code?: string;
      output?: ToolOutput;
    }
  /**
   * The run ended. `steps`: model steps taken; `error` and `code` for `reason: "error"` (`error` is the catalog's
   * English text for the code, never the conversation). Nothing of this run is emitted after it.
   */
  | {
      type: "run-finish";
      ref: RunRef;
      reason: "stop" | "max-steps" | "aborted" | "error";
      ms: number;
      steps: number;
      error?: string;
      code?: string;
    };

/**
 * Options for {@link onAgentRun}.
 *
 * @experimental
 */
export interface OnAgentRunOptions {
  /**
   * Receive tool inputs and outputs (and a parked call's prompt) as they are, without the page's redaction. For the
   * app's own trusted code only: anything that sends events off the page should keep the default. Default false.
   */
  raw?: boolean;
}

/** A run listener. */
export type AgentRunListener = (event: AgentRunEvent) => void;

interface Subscription {
  listener: AgentRunListener;
  raw: boolean;
  /** Logged its first throw already: a listener that throws on every event logs once. */
  warned: boolean;
}

/**
 * Where the listeners live: a `globalThis` slot (`Symbol.for`), so every copy of this package on the page (source and
 * dist, two bundles) emits to the same listeners.
 */
const LISTENERS = Symbol.for("web-agents.run-listeners");

const subscriptions = (): Set<Subscription> => {
  const slot = globalThis as { [LISTENERS]?: Set<Subscription> };
  slot[LISTENERS] ??= new Set();
  return slot[LISTENERS];
};

/**
 * Subscribe to every agent run on the page: the chat's, `useWebAgent`'s, `agent.invoke`'s and their sub-agents', with
 * cloud and on-device adapters. Returns the function that unsubscribes. A listener that throws never breaks a run (the
 * error is logged once); tool inputs and outputs arrive redacted unless `{ raw: true }`.
 *
 * @experimental Run telemetry is new in 0.5.0: event fields may still change in a minor release.
 *
 * @example
 * import { onAgentRun } from "@webmcp-agents/chat";
 *
 * const stop = onAgentRun((e) => {
 *   if (e.type === "tool-finish" && e.state === "error") analytics.track("agent_tool_failed", { tool: e.tool, code: e.code });
 *   if (e.type === "run-finish") analytics.track("agent_run", { reason: e.reason, steps: e.steps, ms: Math.round(e.ms) });
 * });
 */
export function onAgentRun(listener: AgentRunListener, options: OnAgentRunOptions = {}): () => void {
  if (typeof listener !== "function")
    throw new TypeError("onAgentRun(listener) needs a function, e.g. onAgentRun((e) => console.log(e.type)).");
  const sub: Subscription = { listener, raw: options.raw === true, warned: false };
  subscriptions().add(sub);
  return () => {
    subscriptions().delete(sub);
  };
}

/** What a value that cannot be redacted reads as: failing never shows it. */
const HIDDEN = "[REDACTED]";

/** The event as a listener without `raw` gets it: input, output and prompt through the page's redactor. */
function redacted(e: AgentRunEvent): AgentRunEvent {
  try {
    if (e.type === "tool-start" && e.input !== undefined) {
      const marked = toolSensitivity(getRegisteredWebTool(e.tool));
      return { ...e, input: getRedactor()(e.input, { kind: "tool-input", tool: e.tool, sensitive: marked.input }) };
    }
    if (e.type === "tool-finish" && e.output !== undefined) {
      const marked = toolSensitivity(getRegisteredWebTool(e.tool));
      return { ...e, output: getRedactor()(e.output, { kind: "tool-output", tool: e.tool, sensitive: marked.output }) };
    }
    if (e.type === "tool-park") return { ...e, prompt: getRedactor().text(e.prompt) };
  } catch {
    // the redactor never throws by contract; a custom one might: hide the value rather than show it
    if (e.type === "tool-start") return { ...e, input: HIDDEN };
    if (e.type === "tool-finish")
      return { ...e, output: { content: [{ type: "text", text: HIDDEN }], ...(e.output?.isError && { isError: true }) } };
    if (e.type === "tool-park") return { ...e, prompt: HIDDEN };
  }
  return e;
}

/**
 * @internal Deliver `e` to every listener, in the order they subscribed: raw listeners get it as is, the others the
 * redacted copy (made once). A listener that throws is logged once and never stops the run or the other listeners.
 */
export function emitRun(e: AgentRunEvent): void {
  const subs = subscriptions();
  if (subs.size === 0) return;
  const raw = Object.freeze(e);
  let safe: AgentRunEvent | undefined;
  for (const sub of [...subs]) {
    try {
      if (!sub.raw && !safe) safe = Object.freeze(redacted(e));
      sub.listener(sub.raw ? raw : (safe as AgentRunEvent));
    } catch (err) {
      if (sub.warned) continue;
      sub.warned = true;
      console.error("[web-agents/chat] an onAgentRun listener threw (logged once per listener):", getRedactor().error(err));
    }
  }
}

// ---------- ids ----------

/** The kit's deterministic id source (`@webmcp-agents/testing/setup`), the same slot `newId` reads. */
const ID_SLOT = Symbol.for("web-agents.ids");
const idSource = (): ((prefix: string) => string) | undefined => (globalThis as { [ID_SLOT]?: (prefix: string) => string })[ID_SLOT];

/** Random bytes as lowercase hex; `getRandomValues` exists in every browser and in Node 19+, secure context or not. */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(buf);
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A version-4 UUID from random bytes: `crypto.randomUUID` needs a secure context, plain http on a LAN IP has none. */
function uuidFallback(): string {
  const h = randomHex(16).split("");
  h[12] = "4";
  h[16] = ((Number.parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/**
 * @internal A run or conversation id: `crypto.randomUUID()` (unique across pages and tabs), or the test kit's
 * deterministic id for `prefix` (`run-1`, `conversation-1`) when it installed one.
 */
export function runId(prefix: "run" | "conversation"): string {
  const fromKit = idSource()?.(prefix);
  if (fromKit) return fromKit;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // not a secure context
    }
  }
  return uuidFallback();
}

/** `bytes` of hex for a W3C id: random, or derived from the kit's id for `prefix` (so tests see the same header). */
function traceHex(prefix: "trace" | "span", bytes: number): string {
  const fromKit = idSource()?.(prefix);
  if (!fromKit) {
    const hex = randomHex(bytes);
    return /^0+$/.test(hex) ? `${hex.slice(0, -1)}1` : hex; // an all-zero id is invalid
  }
  // FNV-1a over the kit's id, stretched to the length: stable per id, never all zero
  let out = "";
  for (let round = 0; out.length < bytes * 2; round++) {
    let h = 0x811c9dc5 ^ round;
    for (const ch of `${fromKit}#${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    out += (h || 1).toString(16).padStart(8, "0");
  }
  return out.slice(0, bytes * 2);
}

/**
 * @internal The ids of a new run. A root run starts a new trace; a sub-agent's run (`parent`: the delegate call and
 * the delegating run's ref) shares its parent's conversation and trace id, with a span id of its own.
 */
export function newRunRef(conversation: string, parent?: { call: string; of: RunRef }): RunRef {
  const traceId = parent?.of.traceparent?.split("-")[1] ?? traceHex("trace", 16);
  const spanId = traceHex("span", 8);
  return {
    conversation,
    run: runId("run"),
    ...(parent && { parent: parent.call }),
    sampled: parent?.of.sampled === true,
    // read on every request: a run-start listener that records the run flips the flag before the first one
    get traceparent(): string {
      return `00-${traceId}-${spanId}-${this.sampled ? "01" : "00"}`;
    },
  };
}
