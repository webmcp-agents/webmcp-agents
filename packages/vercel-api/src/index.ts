/**
 * @webmcp-agents/vercel-api (private): the examples' `/api/chat` as Vercel web handlers.
 *
 *   // apps/<app>/api/chat.ts
 *   export const { GET, POST, OPTIONS } = createVercelChatRoute({ app: "playground" });
 *
 * Env is read when the route is created (at the function's cold start), never at import time. Telemetry: see
 * `createVercelTelemetryRoute` (`api/telemetry.ts`); both routes share one observability layer per instance.
 */
import { type AllowedTool, type ChatSessionOptions, createChatHandler, type WebAgent } from "@webmcp-agents/chat/server";
import type { LanguageModel } from "ai";
import { budgetGuard, composeGuards, originGuard, rateLimitGuard, secretMissingGuard, sessionGuard } from "./guards";
import { createLimiter, type Env } from "./limiter";
import type { Observability } from "@webmcp-agents/telemetry/server";
import { observabilityFor } from "./telemetry";

export type { Guard } from "./guards";
export { budgetGuard, clientIp, composeGuards, originGuard, rateLimitGuard, secretMissingGuard, sessionGuard } from "./guards";
export type { Env, Limiter, LimiterOptions, LimitResult } from "./limiter";
export { createLimiter, createMemoryLimiter, redisCredentials } from "./limiter";
export { createVercelTelemetryRoute, observabilityFor } from "./telemetry";
export type { VercelTelemetryRouteOptions } from "./telemetry";

/** Options for `createVercelChatRoute`. */
export interface VercelChatRouteOptions {
  /** Namespaces the rate-limit keys per app. */
  app: string;
  /** Default `process.env`. */
  env?: Env;
  /** A model instance, or a `"<provider>/<model>"` id, instead of `WEB_AGENTS_MODEL` (default `anthropic/claude-sonnet-5-5`). */
  model?: LanguageModel | string;
  /**
   * The page's agents (`defineWebAgent`): the same list the page passes to `<AgentChat>`. With agents, a request must
   * name one of them (`requireAgent`): nobody gets the model without the site's instructions.
   */
  agents?: readonly WebAgent[];
  /**
   * The tools the page may offer the model (`createChatHandler({ tools })`): the app's `defineWebTool` tools (pinned:
   * their descriptions come from the server) and the ids of tools defined inline in components. Default: every tool
   * the page sends.
   */
  tools?: readonly AllowedTool[];
  /**
   * Chat sessions (`createChatHandler({ session })`): on by default. With `TURNSTILE_SECRET_KEY` set, a session needs a
   * solved Cloudflare Turnstile challenge; `verify` adds any other check. The secret is `WEB_AGENTS_SESSION_SECRET`,
   * required on Vercel deployments (preview and production). `false` turns sessions off.
   */
  session?: false | ChatSessionOptions;
  /**
   * The layer that exports the chat's spans (`defineObservability()`), when the app owns it (to share it with its own
   * `/api/telemetry` route). Default: the instance's shared layer (`observabilityFor(env)`), off without `OTEL_*`.
   */
  observability?: Observability;
}

const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * The chat handler behind origin and per-IP guards, with a global daily budget on model calls. Public demos default to
 * Claude Sonnet 5.5 (cheaper, faster), 4096 output tokens (thinking counts against them) and 6 steps; every limit is
 * an env var (see docs/more/deploy.md).
 */
export function createVercelChatRoute({ app, env = process.env, model, agents, tools, session = {}, observability }: VercelChatRouteOptions) {
  // each tool step is one request: a 6-step turn is 7, so a burst limit must fit a few turns
  const perMinute = num(env.RATE_LIMIT_PER_MINUTE, 30);
  const perDay = num(env.RATE_LIMIT_PER_DAY, 300);
  const globalDaily = num(env.RATE_LIMIT_GLOBAL_DAILY, 3000);
  const perSession = num(env.RATE_LIMIT_PER_SESSION, 150);
  // a deployment is many function instances: a per-process secret would fail every other request
  const deployed = env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  const missingSecret = session !== false && deployed && !session.secret && !env.WEB_AGENTS_SESSION_SECRET;
  if (missingSecret) {
    console.error("[web-agents/vercel-api] chat is off: set WEB_AGENTS_SESSION_SECRET (32+ random characters) on this deployment.");
  }
  const sessionLimiter = createLimiter({ env, prefix: `${app}:session`, limit: perSession, window: "1 d", failOpen: true });
  const budget = budgetGuard(createLimiter({ env, prefix: `${app}:global`, limit: globalDaily, window: "1 d", failOpen: false }));
  const handler = createChatHandler({
    env,
    model: model ?? env.WEB_AGENTS_MODEL ?? "anthropic/claude-sonnet-5-5",
    agents,
    maxOutputTokens: num(env.WEB_AGENTS_MAX_OUTPUT_TOKENS, 4096),
    maxSteps: num(env.WEB_AGENTS_MAX_STEPS, 6),
    tools,
    requireAgent: (agents?.length ?? 0) > 0,
    // Turnstile gates new sessions once its secret is set (the page sends the token: `turnstileHeaders`)
    session: missingSecret || session === false ? false : { turnstile: Boolean(env.TURNSTILE_SECRET_KEY), ...session },
    guard: composeGuards(
      ...(missingSecret ? [secretMissingGuard] : []),
      originGuard(),
      rateLimitGuard(
        createLimiter({ env, prefix: `${app}:minute`, limit: perMinute, window: "1 m", failOpen: true }),
        createLimiter({ env, prefix: `${app}:day`, limit: perDay, window: "1 d", failOpen: true }),
      ),
    ),
    // off unless OTEL_* is set; the handler hands its flush to Vercel's waitUntil once the stream ends
    observability: observability ?? observabilityFor(env),
    // after validation: malformed requests never use up a session's requests or the shared budget
    beforeModel: async (req, { session: id }) => (id ? await sessionGuard(sessionLimiter, id) : undefined) ?? (await budget(req)),
  });
  return { GET: handler, POST: handler, OPTIONS: handler };
}
