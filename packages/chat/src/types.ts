/**
 * The contract between the chat widget and whatever agent drives it. An
 * adapter owns the model ↔ tool loop and reports what happens as a stream of
 * parts; the widget only renders them. The cloud adapter (this package) and
 * the in-browser adapter (@webmcp-agents/local-agent) both implement it.
 */
import type { JSONSchema, ModelContextToolResult } from "@webmcp-agents/core";
import type { WebAgent } from "./agent";

/** A page tool as the model sees it. */
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/** What a tool call returns: an MCP result, `{ content, isError? }`. */
export type ToolOutput = ModelContextToolResult;

/** Whether an adapter can run right now (the composer explains anything but `ready`). */
export type AdapterStatus =
  | { state: "ready" }
  | { state: "unavailable"; reason: string }
  /** `note`: a caveat for the download card, e.g. "No WebGPU here: a smaller, slower model runs on the CPU." */
  | { state: "needs-download"; bytes?: number; note?: string }
  | { state: "downloading"; progress: number }
  /** Starting up: connecting, or a model already on this device being read from disk (`progress`, 0–1, when known). */
  | { state: "loading"; progress?: number }
  | { state: "error"; error: string };

/** A model an adapter can run, for a picker: what it is good at and what it costs to get. */
export interface ModelChoice {
  id: string;
  /** Short name, e.g. "Qwen3 0.6B". */
  label: string;
  /** One sentence on when to pick it, e.g. "Fastest. Good at short tool calls." */
  brief: string;
  /** Download size in bytes, when known. */
  bytes?: number;
  /** Already on this device: no download. */
  cached?: boolean;
  /** The adapter's default. */
  recommended?: boolean;
  /** The one in use. */
  selected?: boolean;
}

/** Where a tool call is: running, parked on a confirmation the person must click, or finished. */
export type ToolCallState = "running" | "awaiting-confirmation" | "done" | "error" | "cancelled";

/** One piece of a message. */
export type AgentPart =
  | { type: "text"; text: string }
  /**
   * The model's reasoning, kept so the next request can send it back (Claude
   * requires its signed thinking alongside its tool calls). Not rendered.
   */
  | { type: "reasoning"; text: string; providerMetadata?: Record<string, Record<string, unknown>> }
  | {
      type: "tool";
      id: string;
      name: string;
      input: unknown;
      state: ToolCallState;
      output?: ToolOutput;
      error?: string;
      /** While awaiting confirmation: what the person should click. */
      prompt?: string;
      /** A sub-agent's run behind a `delegate_to_<id>` call: the agent's id and its own messages, rendered nested. */
      agent?: { id: string; messages: AgentMessage[] };
      /** Provider data that must travel with the call (Gemini thought signatures, OpenAI item ids), like reasoning's. */
      providerMetadata?: Record<string, Record<string, unknown>>;
    };

/** One turn of the conversation. */
export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  parts: AgentPart[];
  /**
   * Where the page was (path, query and hash) when the person sent this message (user), or when the run that wrote it ended (assistant). The
   * session sets it; when the two differ across a turn, the person changed pages themself in between and the model is
   * told so (`withPageMoves`). Never sent to the server as is.
   */
  page?: string;
}

/** What an adapter reports while it runs, in order. */
export type AgentStreamPart =
  | { type: "message-start"; messageId: string }
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "reasoning"; messageId: string; text: string; providerMetadata?: Record<string, Record<string, unknown>> }
  | {
      type: "tool-call";
      messageId: string;
      id: string;
      name: string;
      input: unknown;
      providerMetadata?: Record<string, Record<string, unknown>>;
    }
  | { type: "tool-result"; id: string; output: ToolOutput }
  | { type: "tool-error"; id: string; error: string }
  | { type: "step-finish"; step: number }
  | { type: "finish"; reason: "stop" | "max-steps" | "aborted" }
  | { type: "error"; error: string; code?: "chat_disabled" | "rate_limited" | "bad_request" | "network" };

/** What an adapter gets for one run (one user message, possibly many model steps). */
export interface AgentRunRequest {
  /** The conversation so far, ending with the new user message. */
  messages: AgentMessage[];
  /**
   * The page's tools right now. A getter: tools change as the page changes (a
   * form hides itself, a route swaps), so read it fresh before every model call.
   */
  readonly tools: ToolDescriptor[];
  /** Aborts when the person presses Stop. */
  signal: AbortSignal;
  /** Run a tool on the page (cursor and all). Never rejects: failures come back as `isError` results. */
  callTool(call: { id: string; name: string; input: unknown }): Promise<ToolOutput>;
  /**
   * The agent running this turn (`defineWebAgent`), when the page set one. `tools` is already filtered through it.
   * Adapters that run in the browser read `instructions` and `maxSteps`; the cloud adapter sends only `id`.
   */
  agent?: WebAgent;
}

/** An agent the chat can talk to: the model ↔ tool loop behind a stream of parts. */
export interface AgentAdapter {
  readonly id: string;
  /** Shown in the adapter switcher, e.g. "Claude (cloud)". */
  readonly label: string;
  /** Current availability. Absent means always ready. */
  status?(): AdapterStatus;
  /** Status changes (a download progressing, the cloud check finishing). */
  subscribe?(listener: () => void): () => void;
  /** Opt-in heavy setup, e.g. a model download, started by the person's click. Aborting `signal` cancels it. */
  prepare?(signal?: AbortSignal): Promise<void>;
  /** The models the person can pick from (the chat shows a picker when there is more than one). */
  models?(): readonly ModelChoice[];
  /** Switch to one of `models()`; the status then reports what the new model needs. Rejects while a run is in flight. */
  selectModel?(id: string): Promise<void>;
  run(req: AgentRunRequest): AsyncIterable<AgentStreamPart>;
}
