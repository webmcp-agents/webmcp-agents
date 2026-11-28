/**
 * The handler's telemetry (design §6.4): the ids of a request (`trace`, the session, the agent) on every AI SDK span,
 * content off unless the app opts in, refusals reported without content, and an optional observability layer
 * (`@webmcp-agents/telemetry` implements {@link ChatObservability}; this package never imports it).
 *
 * Nothing here touches global telemetry state: no `registerTelemetry`, no global tracer provider. The AI SDK settings
 * are passed per call, through the `ToolLoopAgent` the handler builds for each request.
 */
import type { LanguageModelUsage } from "ai";
import type { WebAgent } from "../agent";
import type { StepUsage } from "../session/run-events";
import type { ChatRequest } from "./validate";
import type { WebAgentSettings } from "./web-agent";

/** The AI SDK telemetry settings of one call (`ToolLoopAgent`'s `telemetry`). */
export type ChatTelemetrySettings = NonNullable<WebAgentSettings["telemetry"]>;

/**
 * A request as the handler knows it once it is validated: who asks (`agent`, `session`) and which run and step
 * (`trace`). Given to `telemetry.metadata`, the observability layer, `prepareAgent` and `beforeModel`.
 *
 * @experimental
 */
export interface ChatRequestContext {
  /** The registered agent the request named, if any. */
  agent?: WebAgent;
  /** The request's chat session id, with `createChatHandler({ session })` on. */
  session?: string;
  /** The run's ids the page sent (absent from a 0.4.0 page). */
  trace?: ChatRequest["trace"];
  /** The request's `traceparent` header when it is a valid W3C one; a malformed header reads as absent. */
  traceparent?: string;
}

/**
 * What a refused or failed request is reported as (`telemetry.onRefused`, `ChatObservability.refused`). It never
 * holds content: no message, no tool input, no model output.
 *
 * @experimental
 */
export interface ChatRefusal {
  /** The HTTP status the request got (a model error mid-stream reads as 502). */
  status: number;
  /**
   * The error code: `forbidden`, `method_not_allowed`, `chat_disabled`, `session_required`, `bad_request`,
   * `server_error`, `model_error`, or what a `guard` / `beforeModel` response named in its JSON body (`refused` when it
   * named none).
   */
  error: string;
  /**
   * More detail, still free of content: `daily_budget`, `body_too_large`, `not_json`, `unknown_agent`, `agent_required`,
   * `invalid_trace`, the path of the first invalid field (`messages.0.parts`), a guard's own `reason`, or the model
   * error's status.
   */
  reason?: string;
  /** The run's ids, when the request carried valid ones. */
  trace?: ChatRequest["trace"];
}

/**
 * The handler's `telemetry` option. Every field is optional; the defaults record the ids of each step and none of its
 * content.
 *
 * @experimental
 */
export interface ChatTelemetryOptions {
  /**
   * Record prompts and tool definitions on the step's spans. The AI SDK's own default is true; this handler's is false,
   * so content never reaches a backend unless you ask for it. An observability layer still redacts what is recorded.
   * Default false.
   */
  recordInputs?: boolean;
  /** Record the model's text, reasoning and tool calls on the step's spans. Default false (the AI SDK's is true). */
  recordOutputs?: boolean;
  /**
   * What groups traces in the backend (the AI SDK's `functionId`). Default `"web-agent"` for a request without an
   * agent, `"web-agent.<agent id>"` for one with.
   *
   * @example
   * telemetry: { functionId: (agent) => `shop.${agent?.id ?? "assistant"}` }
   */
  functionId?: string | ((agent: WebAgent | undefined) => string);
  /**
   * Extra span attributes for this request: a user id from your session, a release. Called once per request; a
   * throw or rejection is logged once and the request goes on without them. Only strings, numbers and booleans are
   * kept. Never put secrets here: attributes leave your server.
   *
   * @example
   * telemetry: { metadata: async (req) => ({ "user.id": (await getSession(req))?.userId ?? "anonymous" }) }
   */
  metadata?: (req: Request, ctx: ChatRequestContext) => ChatTelemetryMetadata | Promise<ChatTelemetryMetadata>;
  /**
   * Send each step's token usage and model id to the browser (the stream's message metadata), where run events report
   * them on `step-finish`. Default true; false keeps usage on the server.
   */
  usageToClient?: boolean;
  /**
   * Called for every refused or failed request: a guard, a missing session, validation, `beforeModel` (a budget), an
   * unknown agent, a model error. It never receives content; a throw is logged once and changes nothing.
   *
   * @example
   * telemetry: { onRefused: ({ status, error, reason }) => console.warn(JSON.stringify({ at: "chat", status, error, reason })) }
   */
  onRefused?: (info: ChatRefusal, req: Request) => void;
}

/** Attribute values `telemetry.metadata` may return. */
export type ChatTelemetryMetadata = Record<string, string | number | boolean>;

/**
 * What an observability layer gives the handler (`createChatHandler({ observability })`). Structural: this package never
 * imports `@webmcp-agents/telemetry`, which implements it, and anyone can write their own. Every method may fail: the
 * handler logs it once and serves the request as if the layer were absent.
 *
 * @experimental
 */
export interface ChatObservability {
  /**
   * The AI SDK telemetry settings for this request's model call: `integrations` bound to the layer's tracer, `isEnabled`
   * (sampling), the layer's own recording flags. Merged over the handler's: the handler's `functionId`, ids and explicit
   * `recordInputs` / `recordOutputs` win. Note: in `ai@7`, per-call `integrations` replace the ones registered with
   * `registerTelemetry` for that call.
   */
  telemetry(ctx: ChatRequestContext): Partial<ChatTelemetrySettings>;
  /** Run the request inside the trace context of its `traceparent` header (when valid), so the step's span joins the run's trace. */
  withContext<T>(req: Request, run: () => Promise<T>): Promise<T>;
  /** Told of every refusal (the same info `telemetry.onRefused` gets), to count or log it. */
  refused?(info: ChatRefusal, req: Request): void;
  /** Resolve once buffered spans are sent. The handler hands it to the host's `waitUntil` when there is one. */
  flush(): Promise<void>;
  /** How long a `flush` may take before the handler stops waiting for it, in ms. Default 5000. */
  exportTimeoutMs?: number;
}

/** The runtime-context keys the handler sets on every model call (the ids of the request), as span attributes. */
export const RUNTIME_CONTEXT_KEYS = [
  "webmcp.conversation.id",
  "webmcp.run.id",
  "webmcp.step",
  "webmcp.parent.call.id",
  "webmcp.agent.id",
  "webmcp.session.id",
] as const;

/** A value `metadata` may set as an attribute. */
const isAttribute = (v: unknown): v is string | number | boolean =>
  typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/** The function id of a request: the option, else `web-agent` / `web-agent.<agent id>`. */
export function functionIdFor(opts: ChatTelemetryOptions, agent: WebAgent | undefined): string {
  if (typeof opts.functionId === "function") {
    const id = opts.functionId(agent);
    if (typeof id === "string" && id) return id;
  } else if (typeof opts.functionId === "string" && opts.functionId) return opts.functionId;
  return agent ? `web-agent.${agent.id}` : "web-agent";
}

/** What a request's model call gets: `runtimeContext` (the ids, then the app's metadata) and `telemetry`. */
export interface RequestTelemetry {
  runtimeContext: Record<string, string | number | boolean>;
  telemetry: ChatTelemetrySettings;
}

/**
 * The telemetry settings of one request. `extra`: what `metadata` returned (already awaited and checked); `layer`:
 * the observability layer's part. Keys the request lacks (a 0.4.0 page sends no `trace`) are left out, never `undefined`.
 */
export function telemetrySettings(
  opts: ChatTelemetryOptions,
  ctx: ChatRequestContext,
  extra: ChatTelemetryMetadata = {},
  layer: Partial<ChatTelemetrySettings> = {},
): RequestTelemetry {
  const ids: Record<string, string | number | undefined> = {
    "webmcp.conversation.id": ctx.trace?.conversation,
    "webmcp.run.id": ctx.trace?.run,
    "webmcp.step": ctx.trace?.step,
    "webmcp.parent.call.id": ctx.trace?.parent,
    "webmcp.agent.id": ctx.agent?.id,
    "webmcp.session.id": ctx.session,
  };
  const runtimeContext: Record<string, string | number | boolean> = {};
  // the app's attributes first: the ids win over a key it reuses
  for (const [k, v] of Object.entries(extra)) if (isAttribute(v)) runtimeContext[k] = v;
  for (const [k, v] of Object.entries(ids)) if (v !== undefined) runtimeContext[k] = v;
  return {
    runtimeContext,
    telemetry: {
      ...layer,
      functionId: functionIdFor(opts, ctx.agent),
      // content stays out unless the app (here, or in its layer) opted in: the AI SDK's default is the opposite
      recordInputs: opts.recordInputs ?? layer.recordInputs ?? false,
      recordOutputs: opts.recordOutputs ?? layer.recordOutputs ?? false,
      includeRuntimeContext: Object.fromEntries(Object.keys(runtimeContext).map((k) => [k, true])),
    },
  };
}

/** `metadata` checked: an object of attribute values, else nothing. */
export function checkedMetadata(value: unknown): ChatTelemetryMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => k.length > 0 && k.length <= 128 && isAttribute(v)));
}

/** The usage the browser gets for a step, from the AI SDK's: only counts that are numbers. */
export function pickUsage(usage: LanguageModelUsage | undefined): StepUsage | undefined {
  if (!usage) return undefined;
  const out: StepUsage = {};
  const set = (key: keyof StepUsage, n: number | undefined): void => {
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[key] = n;
  };
  set("inputTokens", usage.inputTokens);
  set("outputTokens", usage.outputTokens);
  set("totalTokens", usage.totalTokens);
  set("reasoningTokens", usage.outputTokenDetails?.reasoningTokens);
  set("cachedInputTokens", usage.inputTokenDetails?.cacheReadTokens);
  return Object.keys(out).length ? out : undefined;
}

/** Something a host may pass the handler that can keep work alive after the response (Vercel, Cloudflare, Next.js `after`). */
type WaitUntil = (promise: Promise<unknown>) => void;

const VERCEL_CONTEXT = Symbol.for("@vercel/request-context");

/**
 * The host's `waitUntil`: the handler option, else one on an argument the host passed after the request (a Cloudflare
 * Worker's `ctx`, a `{ waitUntil }` context), else Vercel's request context. Undefined when there is none.
 */
export function findWaitUntil(explicit: WaitUntil | undefined, args: readonly unknown[]): WaitUntil | undefined {
  if (typeof explicit === "function") return explicit;
  for (const arg of args) {
    const fn = (arg as { waitUntil?: unknown } | null)?.waitUntil;
    if (typeof fn === "function") return fn.bind(arg) as WaitUntil;
  }
  try {
    const vercel = (globalThis as { [VERCEL_CONTEXT]?: { get?: () => { waitUntil?: unknown } | undefined } })[VERCEL_CONTEXT];
    const fn = vercel?.get?.()?.waitUntil;
    if (typeof fn === "function") return fn as WaitUntil;
  } catch {
    // no Vercel context here
  }
  return undefined;
}

/** `promise`, but settled after `ms` at the latest; never rejects (`onError` gets the failure or the timeout). */
export function capped(promise: Promise<unknown>, ms: number, onError: (err: unknown) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      onError(new Error(`flush did not finish within ${ms} ms`));
      resolve();
    }, ms);
    (timer as { unref?: () => void }).unref?.();
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err: unknown) => {
        clearTimeout(timer);
        onError(err);
        resolve();
      },
    );
  });
}

/**
 * `body` passed through, calling `done` once when it ends: read to the end, cancelled by the client, or errored. The
 * stream is never held for `done`.
 */
export function onStreamEnd(body: ReadableStream<Uint8Array>, done: () => void): ReadableStream<Uint8Array> {
  let called = false;
  const end = (): void => {
    if (called) return;
    called = true;
    done();
  };
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done: finished } = await reader.read();
        if (finished) {
          controller.close();
          end();
        } else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
        end();
      }
    },
    async cancel(reason) {
      end();
      await reader.cancel(reason).catch(() => {});
    },
  });
}
