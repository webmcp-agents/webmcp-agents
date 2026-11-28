/**
 * `/api/chat` as a web-standard function: `(req: Request) => Promise<Response>`,
 * so it runs on Vercel, in any Node/edge server, and in `vite dev` (see ../vite).
 *
 * The page's tools arrive with every request and are declared without
 * `execute`: the model's tool calls stream back to the browser, which runs them
 * on the live page (cursor and all) and posts the results in the next request.
 * One request = one model step, run by an AI SDK `ToolLoopAgent` built for the
 * request from the registered WebAgent (instructions, tool subset, sub-agents,
 * model), or from the plain assistant prompt when the page set no agent.
 */
import { type ChatServerMessages, serverMessages } from "./messages";
import { createAgentUIStreamResponse, InvalidToolInputError, type LanguageModel, NoSuchToolError, ToolLoopAgent, type ToolSet } from "ai";
import { toUIMessages } from "../adapter/wire";
import { flattenWebAgents, type WebAgent } from "../agent";
import type { AgentMessage } from "../types";
import { createRedactor, getRedactor, type RedactOptions, type Redactor } from "@webmcp-agents/core/redact";
import { describeModelError } from "./model-error";
import { modelAvailability, ModelUnavailableError, parseModelId, providerOptionsFor, type ReasoningLevel, resolveModel } from "./models";
import { DEFAULT_SYSTEM_PROMPT } from "./system-prompt";
import { type ChatRequest, chatRequestSchema, chatTraceSchema, isCrossSite, LIMITS, readCappedText, samePagePath } from "./validate";
import { type AllowedTool, applyAllowlist, buildAllowlist } from "./allowlist";
import { type ChatSession, type ChatSessionOptions, createSessionKeeper } from "./session";
import {
  capped,
  type ChatObservability,
  type ChatRefusal,
  type ChatRequestContext,
  type ChatTelemetryOptions,
  checkedMetadata,
  findWaitUntil,
  onStreamEnd,
  pickUsage,
  telemetrySettings,
} from "./telemetry";
import { toToolLoopAgentSettings, type WebAgentSettings } from "./web-agent";
import { validTraceparent } from "../shared";

/** Claude Opus 5.5 through its own SDK: the roadmap's default. Override with WEB_AGENTS_MODEL (e.g. anthropic/claude-sonnet-5-5). */
export const DEFAULT_MODEL = "anthropic/claude-opus-5-5";

/** @deprecated Anthropic-only effort levels; use `reasoning` ("off" | "low" | "medium" | "high"). */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ChatHandlerOptions {
  /**
   * A LanguageModel instance, or a `"<provider>/<model>"` id resolved with the provider's key from `env`
   * (`anthropic/…`, `openai/…`, `google/…`, `deepseek/…`, `xai/…`, `mistral/…`, `openrouter/<vendor>/<model>`, or
   * any `a/b` id through the AI Gateway). A bare `claude-…` id is Anthropic's. Default: env WEB_AGENTS_MODEL ?? `DEFAULT_MODEL`.
   */
  model?: LanguageModel | string;
  /** System prompt. Default `DEFAULT_SYSTEM_PROMPT` (acting on a live page, confirmations, short replies). */
  system?: string;
  /**
   * The agents the page may name (`defineWebAgent`), sub-agents included: their instructions, tool subsets and models
   * are read from here by id. A request naming an agent not in this list is refused (400).
   */
  agents?: readonly WebAgent[];
  /**
   * Output token cap per step. A thinking model's reasoning counts against it, so keep room
   * beyond the visible reply. Default 8192.
   */
  maxOutputTokens?: number;
  /** How hard the model thinks per step, for any provider that has the knob. Default "low": a chat about the page should feel quick. */
  reasoning?: ReasoningLevel;
  /** @deprecated Anthropic's effort levels (wins over `reasoning` when both are set, Anthropic only). */
  effort?: Effort;
  /** Tool steps per user turn; the request after the last one gets no tools, so the model sums up. Default 8 (the cloud adapter's default too). An agent's own `maxSteps` wins. */
  maxSteps?: number;
  /**
   * Runs first; return a Response to short-circuit. A public deployment needs one: rate limits per IP/session, a
   * token budget. Cross-site browser requests are already refused.
   */
  guard?: (req: Request) => Promise<Response | undefined> | Response | undefined;
  /**
   * Runs after the request is validated and chat is known to be enabled, right before the model call: count budgets
   * here, so malformed or refused requests never use them up. Return a Response to refuse.
   */
  beforeModel?: (req: Request, context: BeforeModelContext) => Promise<Response | undefined> | Response | undefined;
  /**
   * Tune the AI SDK `ToolLoopAgent` the handler builds for each request (add `prepareStep`, telemetry, middleware…).
   * The settings carry the model, the instructions and the page's tools already applied; return what to use.
   */
  prepareAgent?: (settings: WebAgentSettings, context: PrepareAgentContext) => WebAgentSettings;
  /**
   * Require a chat session: the GET the page makes first sets a random, signed, httpOnly cookie, and a POST without a
   * valid one gets 401 `session_required` (the cloud adapter then starts a new session and retries once). `true` or
   * `{}` for the defaults; `verify` is where a bot check gates new sessions. Default false.
   */
  session?: boolean | ChatSessionOptions;
  /**
   * The tools a page may offer the model, as tools from `defineWebTool` (their description and schema are taken from
   * here, never from the request) or tool ids (the page's own description is used: tools defined inline in a
   * component). Tool ids the registered agents list are allowed too. Any other tool the request lists is dropped.
   * Default: not set, every tool the page sends is used.
   */
  tools?: readonly AllowedTool[];
  /** Refuse (400) a POST that names no agent, so every conversation runs with a registered agent's instructions. Default false. */
  requireAgent?: boolean;
  /** Where the provider keys, WEB_AGENTS_MODEL and WEB_AGENTS_SESSION_SECRET come from. Default `process.env`. */
  env?: Record<string, string | undefined>;
  /**
   * This handler's redaction rules, for everything it logs (model errors, failed requests, Turnstile) and the error
   * text it sends back: options (`{ keys: (d) => [...d, "tenantSecret"] }`) or a ready `Redactor`. Separate from the
   * page's: whatever a page configures, the server follows these. Request bodies are never logged. Default: the
   * process's redactor (`getRedactor()` from `@webmcp-agents/core/redact`, read at each log line), whose default rules
   * mask passwords, tokens, API keys, emails and card numbers.
   *
   * @example
   * createChatHandler({ agents, redact: { keys: (d) => [...d, "tenantSecret"] } });
   */
  redact?: RedactOptions | Redactor;
  /**
   * The text this handler writes for the model and for clients that are not the chat UI: the tool-budget note, the
   * result of a call to a tool that is not on the page, and a 500's message. Default: English. The chat UI words its
   * own errors from its catalog (`<AgentChat messages>`), by code.
   *
   * @example
   * createChatHandler({ messages: { serverError: "El asistente tuvo un problema. Inténtalo de nuevo." } });
   */
  messages?: ChatServerMessages;
  /**
   * Telemetry for each model step, through the AI SDK's per-call settings (no global state is touched). By default
   * (`{}`), a step's spans carry the request's ids (conversation, run, step, parent call, agent, session) and no content:
   * `recordInputs` and `recordOutputs` are false, the opposite of the AI SDK's own default. The spans go to the AI SDK
   * integrations the app registered (`registerTelemetry`), or to `observability`'s. `false` passes no telemetry setting
   * and sends no usage to the browser; ids are still accepted on the wire.
   *
   * @experimental
   * @example
   * createChatHandler({
   *   agents: [storeAgent],
   *   telemetry: {
   *     metadata: async (req) => ({ "user.id": (await getSession(req))?.userId ?? "anonymous" }),
   *     onRefused: ({ status, error, reason }) => console.warn(JSON.stringify({ at: "chat", status, error, reason })),
   *   },
   * });
   */
  telemetry?: boolean | ChatTelemetryOptions;
  /**
   * An observability layer, e.g. `defineObservability()` from `@webmcp-agents/telemetry`: its AI SDK integrations for
   * each step, the request run inside its trace context (`traceparent`), refusals reported to it, and its `flush` after
   * the stream closes (handed to the host's `waitUntil`). A layer that fails never fails a request. Default: none.
   *
   * @experimental
   */
  observability?: ChatObservability;
  /**
   * Keeps work alive after the response is sent, for `observability.flush`. Default: found on its own: an argument the
   * host passes after the request (a Cloudflare Worker's `ctx`), or Vercel's request context. Without one, the flush
   * runs after the stream closes, capped by the layer's `exportTimeoutMs`, and never delays the stream.
   *
   * @experimental
   * @example
   * import { after } from "next/server";
   * createChatHandler({ observability, waitUntil: (p) => after(p) });
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** What `beforeModel` gets besides the request. */
export interface BeforeModelContext {
  /** The registered agent the request named, if any. */
  agent?: WebAgent;
  /** The request's session id, with `session` on: key per-session limits on it. */
  session?: string;
  /** The run's ids the page sent (`trace`), absent from a 0.4.0 page. @experimental */
  trace?: ChatRequest["trace"];
}

/** What `prepareAgent` gets besides the settings. */
export interface PrepareAgentContext {
  /** The registered agent the request named, if any. */
  agent?: WebAgent;
  /** The request. */
  request: Request;
  /** The request's session id, with `session` on. @experimental */
  session?: string;
  /** The run's ids the page sent (`trace`), absent from a 0.4.0 page. @experimental */
  trace?: ChatRequest["trace"];
}

/** How long `telemetry.metadata` may take before the request goes on without it, in ms. */
const METADATA_TIMEOUT_MS = 2000;
/** The default cap on an observability layer's `flush`, in ms. */
const EXPORT_TIMEOUT_MS = 5000;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The response with a `Set-Cookie` added (a copy: a streamed response's headers may be immutable). */
const withCookie = (res: Response, cookie: string | undefined): Response => {
  if (!cookie) return res;
  const headers = new Headers(res.headers);
  headers.append("set-cookie", cookie);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

/** Assistant messages with tool calls since the last user message: the steps this turn has taken. */
function stepsThisTurn(messages: ChatRequest["messages"]): number {
  let steps = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user") break;
    if (m.parts.some((p) => p.type === "tool")) steps++;
  }
  return steps;
}

async function readBody(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    // also makes a cross-site browser POST a preflighted request
    return { ok: false, response: json({ error: "bad_request", message: "Send JSON (content-type: application/json)" }, 415) };
  }
  const text = await readCappedText(req, LIMITS.bodyBytes);
  if (text === null) return { ok: false, response: json({ error: "bad_request", message: "Request body too large" }, 413) };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: json({ error: "bad_request", message: "Body is not JSON" }, 400) };
  }
}

/** Create the `/api/chat` handler. GET reports whether chat is configured; POST runs one model step. */
export function createChatHandler(opts: ChatHandlerOptions = {}): (req: Request, ...host: unknown[]) => Promise<Response> {
  const env = opts.env ?? (typeof process === "undefined" ? {} : process.env);
  const modelId = typeof opts.model === "string" ? opts.model : (env.WEB_AGENTS_MODEL ?? DEFAULT_MODEL);
  const instance = typeof opts.model === "object" ? opts.model : undefined;
  const registry = flattenWebAgents(opts.agents ?? []);
  const level: ReasoningLevel = opts.effort
    ? opts.effort === "xhigh" || opts.effort === "max"
      ? "high"
      : opts.effort
    : (opts.reasoning ?? "low");
  let warnedUnavailable = false;
  const text = serverMessages(opts.messages);
  // its own rules when given; otherwise the process's, read at each line so a later configureRedaction applies
  const own = opts.redact === undefined || typeof opts.redact === "function" ? opts.redact : createRedactor(opts.redact);
  const redactor = (): Redactor => own ?? getRedactor();
  const sessions = opts.session ? createSessionKeeper(opts.session === true ? {} : opts.session, env, own) : undefined;
  const allowlist = opts.tools ? buildAllowlist(opts.tools, registry.values()) : undefined;
  const telemetry: ChatTelemetryOptions | false =
    opts.telemetry === false ? false : opts.telemetry === true || !opts.telemetry ? {} : opts.telemetry;
  const observability = opts.observability;

  // ---------- telemetry's failures: logged once each, never the request's ----------
  const warned = new Set<string>();
  const warnOnce = (what: string, err: unknown): void => {
    if (warned.has(what)) return;
    warned.add(what);
    console.error(`[web-agents/chat] ${what} failed (logged once; the chat is unaffected): ${redactor().error(err)}`);
  };

  /** The layer's `flush`, capped, handed to the host's `waitUntil` when there is one; never awaited by the response. */
  const flush = (host: readonly unknown[]): void => {
    if (!observability) return;
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(observability.flush());
    } catch (err) {
      pending = Promise.reject(err);
    }
    const ms = observability.exportTimeoutMs ?? EXPORT_TIMEOUT_MS;
    const done = capped(pending, ms > 0 ? ms : EXPORT_TIMEOUT_MS, (err) => warnOnce("observability.flush", err));
    try {
      findWaitUntil(opts.waitUntil, host)?.(done);
    } catch (err) {
      warnOnce("waitUntil", err);
    }
  };

  /** Tell `onRefused` and the layer, without content (the reason is redacted all the same). Never throws. */
  const report = (info: ChatRefusal, req: Request): void => {
    const safe: ChatRefusal = {
      status: info.status,
      error: redactor().text(info.error).slice(0, 64),
      ...(info.reason !== undefined && { reason: redactor().text(String(info.reason)).slice(0, 200) }),
      ...(info.trace && { trace: info.trace }),
    };
    if (telemetry && typeof telemetry.onRefused === "function") {
      try {
        telemetry.onRefused(safe, req);
      } catch (err) {
        warnOnce("telemetry.onRefused", err);
      }
    }
    try {
      observability?.refused?.(safe, req);
    } catch (err) {
      warnOnce("observability.refused", err);
    }
  };

  /**
   * Return `res`, a refusal, after reporting it. `error` / `reason` default to what its JSON body says (a guard's or
   * `beforeModel`'s own response), read from a copy, briefly.
   */
  const refuse = async (res: Response, req: Request, host: readonly unknown[], info: Partial<ChatRefusal> = {}): Promise<Response> => {
    let { error, reason } = info;
    if (error === undefined && res.headers.get("content-type")?.includes("json")) {
      const body = (await Promise.race([
        res
          .clone()
          .json()
          .catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), 200)),
      ])) as { error?: unknown; reason?: unknown } | null;
      if (typeof body?.error === "string") error = body.error;
      if (reason === undefined && typeof body?.reason === "string") reason = body.reason;
    }
    report(
      { status: res.status, error: error ?? "refused", ...(reason !== undefined && { reason }), ...(info.trace && { trace: info.trace }) },
      req,
    );
    flush(host);
    return res;
  };

  /** The default model's availability (an instance is always available). */
  const availability = () =>
    instance ? { enabled: true, provider: "custom", message: "", missingEnv: [], viaGateway: false } : modelAvailability(modelId, env);

  /** The model for a request: the agent's own id, else the handler's (an instance wins over ids). */
  const modelFor = async (agent: WebAgent | undefined): Promise<{ model: LanguageModel; provider: string; id: string }> => {
    if (instance && !agent?.model) return { model: instance, provider: "custom", id: instance.modelId ?? "custom" };
    const id = agent?.model ?? modelId;
    const resolved = await resolveModel(id, env);
    return { ...resolved, id };
  };

  return async (req, ...host) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (req.method !== "GET" && req.method !== "POST") return refuse(json({ error: "method_not_allowed" }, 405), req, host);

    if (isCrossSite(req)) return refuse(json({ error: "forbidden", message: "Cross-site requests are not allowed." }, 403), req, host);
    const blocked = await opts.guard?.(req);
    if (blocked) return refuse(blocked, req, host);
    const available = availability();
    if (req.method === "GET") {
      const res = json({
        enabled: available.enabled,
        model: instance ? (instance.modelId ?? "custom") : modelId,
        provider: available.provider,
        agents: [...registry.keys()],
      });
      if (!sessions || !available.enabled) return res;
      // the page's first request: start a session, or keep the one it has (renewed when due)
      const current = await sessions.read(req);
      if (!current) return withCookie(res, await sessions.issue(req));
      return withCookie(res, sessions.due(current) ? await sessions.issue(req, current) : undefined);
    }

    if (!available.enabled) {
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        console.warn(`[web-agents/chat] chat is disabled: ${redactor().text(available.message)}`);
      }
      return refuse(json({ error: "chat_disabled", message: available.message }, 503), req, host, { error: "chat_disabled" });
    }
    // before the body is read: a request without a session costs nothing
    let session: ChatSession | undefined;
    if (sessions) {
      session = await sessions.read(req);
      if (!session)
        return refuse(
          json({ error: "session_required", message: "No chat session: GET this endpoint first (the page does)." }, 401),
          req,
          host,
          {
            error: "session_required",
          },
        );
    }
    const body = await readBody(req);
    if (!body.ok) {
      const status = body.response.status;
      return refuse(body.response, req, host, {
        error: "bad_request",
        reason: status === 413 ? "body_too_large" : status === 415 ? "not_json_content_type" : "not_json",
      });
    }
    const parsed = chatRequestSchema.safeParse(body.value);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 10);
      const first = issues[0]?.path.join(".");
      // the trace ids, when they were the valid part: the refusal still joins its run
      const traced = chatTraceSchema.safeParse((body.value as { trace?: unknown } | null)?.trace);
      return refuse(json({ error: "bad_request", issues }, 400), req, host, {
        error: "bad_request",
        reason: first?.startsWith("trace") ? "invalid_trace" : first || "invalid_body",
        ...(traced.success && { trace: traced.data }),
      });
    }
    const { messages, page, trace } = parsed.data;
    const pageTools = allowlist ? applyAllowlist(parsed.data.tools, allowlist) : parsed.data.tools;
    const agent = parsed.data.agent ? registry.get(parsed.data.agent) : undefined;
    if (parsed.data.agent && !agent) {
      return refuse(
        json(
          { error: "bad_request", message: `Unknown agent "${parsed.data.agent}": register it with createChatHandler({ agents }).` },
          400,
        ),
        req,
        host,
        { error: "bad_request", reason: "unknown_agent", trace },
      );
    }
    if (opts.requireAgent && !agent) {
      return refuse(
        json({ error: "bad_request", message: "Name an agent: this endpoint only runs its registered agents." }, 400),
        req,
        host,
        {
          error: "bad_request",
          reason: "agent_required",
          trace,
        },
      );
    }
    const refused = await opts.beforeModel?.(req, { agent, session: session?.id, trace });
    if (refused) return refuse(refused, req, host, { trace });
    const renewal = session && sessions?.due(session) ? await sessions.issue(req, session) : undefined;
    const context: ChatRequestContext = {
      agent,
      session: session?.id,
      trace,
      traceparent: validTraceparent(req.headers.get("traceparent")),
    };

    const maxSteps = agent?.maxSteps ?? opts.maxSteps ?? 8;
    const budgetSpent = stepsThisTurn(messages) >= maxSteps;

    // ---------- the model call, inside the layer's trace context when there is one ----------
    const serve = async (): Promise<Response> => {
      try {
        const { model, provider, id } = await modelFor(agent);
        let settings = toToolLoopAgentSettings(agent, {
          model,
          tools: pageTools,
          path: samePagePath(page?.url, req.headers.get("origin")),
          base: opts.system ?? DEFAULT_SYSTEM_PROMPT,
          extraInstructions: budgetSpent ? text.toolBudget : undefined,
          toolSet: budgetSpent ? {} : undefined,
          maxOutputTokens: opts.maxOutputTokens ?? 8192,
          providerOptions: provider === "custom" ? undefined : providerOptionsFor(provider, level, parseModelId(id).id),
        });
        if (telemetry) settings = { ...settings, ...(await requestTelemetry(telemetry, req, context)) };
        if (opts.prepareAgent) settings = opts.prepareAgent(settings, { agent, request: req, session: session?.id, trace });
        // The AI SDK's default `onError` prints the raw error (a provider's message can echo a key): the stream's
        // `onError` below logs it, redacted. An app that sets its own through `prepareAgent` keeps it.
        const loop = new ToolLoopAgent<never, ToolSet>({ onError: () => {}, ...settings });
        const usageToClient = telemetry !== false && telemetry.usageToClient !== false;
        const streamed = await createAgentUIStreamResponse({
          agent: loop,
          uiMessages: toUIMessages(messages as AgentMessage[]),
          abortSignal: req.signal,
          sendReasoning: true,
          // the step's usage and model on the stream's last chunk (`finish`), for the browser's run events
          messageMetadata: usageToClient
            ? ({ part }) => {
                if (part.type !== "finish") return undefined;
                try {
                  const usage = pickUsage(part.totalUsage);
                  return { ...(usage && { usage }), model: id };
                } catch {
                  return undefined;
                }
              }
            : undefined,
          onError: (err) => {
            // A bad tool call goes back to the model as that call's error: say exactly what was wrong.
            if (NoSuchToolError.isInstance(err)) return text.notOnPage(err.toolName);
            if (InvalidToolInputError.isInstance(err)) return `Error [invalid_input]: Invalid input for "${err.toolName}": ${err.message}`;
            const { message, log } = describeModelError(err, undefined, redactor());
            console.error(`[web-agents/chat] model error: ${log}`);
            const upstream = (err as { statusCode?: unknown } | null)?.statusCode;
            report({ status: 502, error: "model_error", ...(typeof upstream === "number" && { reason: String(upstream) }), trace }, req);
            return message;
          },
        });
        const res = withCookie(streamed, renewal);
        if (!observability) return res;
        if (!res.body) {
          flush(host);
          return res;
        }
        // flushed once the stream ends (read, cancelled or failed): never before, and never holding it
        return new Response(
          onStreamEnd(res.body, () => flush(host)),
          { status: res.status, statusText: res.statusText, headers: res.headers },
        );
      } catch (err) {
        if (err instanceof ModelUnavailableError) {
          console.error(`[web-agents/chat] ${redactor().error(err)}`);
          return refuse(json({ error: "chat_disabled", message: err.message }, 503), req, host, {
            error: "chat_disabled",
            reason: "model_unavailable",
            trace,
          });
        }
        // the message only, redacted: never the request (its body holds the conversation) nor a provider's echo of a key
        console.error(`[web-agents/chat] request failed: ${redactor().error(err)}`);
        return refuse(json({ error: "server_error", message: text.serverError }, 500), req, host, { error: "server_error", trace });
      }
    };
    if (!observability) return serve();

    // A layer that fails must not fail the request: served without it, and never twice.
    let served: Promise<Response> | undefined;
    const once = (): Promise<Response> => (served ??= serve());
    try {
      const res = await observability.withContext(req, once);
      if (res instanceof Response) return res;
    } catch (err) {
      warnOnce("observability.withContext", err);
    }
    return once();
  };

  /** The request's telemetry settings: the ids, the app's `metadata` (capped, checked), the layer's part. */
  async function requestTelemetry(
    options: ChatTelemetryOptions,
    req: Request,
    context: ChatRequestContext,
  ): Promise<Pick<WebAgentSettings, "telemetry" | "runtimeContext">> {
    let extra = {};
    if (options.metadata) {
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`metadata took longer than ${METADATA_TIMEOUT_MS} ms`)), METADATA_TIMEOUT_MS);
        });
        try {
          extra = checkedMetadata(await Promise.race([Promise.resolve().then(() => options.metadata!(req, context)), late]));
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        warnOnce("telemetry.metadata", err);
      }
    }
    let layer = {};
    if (observability) {
      try {
        layer = observability.telemetry(context) ?? {};
      } catch (err) {
        warnOnce("observability.telemetry", err);
      }
    }
    return telemetrySettings(options, context, extra, layer);
  }
}
