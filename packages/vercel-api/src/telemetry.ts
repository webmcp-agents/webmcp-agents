/**
 * Telemetry for the examples on Vercel: one `defineObservability()` per function instance (a cold start), shared by
 * `/api/chat` and `/api/telemetry`. It is off unless the deployment sets the standard `OTEL_*` variables (or the app
 * registers a tracer provider), and nothing loads until a request needs it.
 */
import { defineObservability, type Observability } from "@webmcp-agents/telemetry/server";
import { composeGuards, originGuard, rateLimitGuard } from "./guards";
import { createLimiter, type Env } from "./limiter";

/** One layer per env object: `process.env` (the deployment) gets one for the life of the instance. */
const layers = new WeakMap<Env, Observability>();

/**
 * The instance's observability layer for `env`: created on first use and reused by every route of the instance, so
 * the chat's spans and the relayed browser spans share one exporter and one batch.
 */
export function observabilityFor(env: Env): Observability {
  let layer = layers.get(env);
  if (!layer) {
    layer = defineObservability({ env });
    layers.set(env, layer);
  }
  return layer;
}

/** Options for `createVercelTelemetryRoute`. */
export interface VercelTelemetryRouteOptions {
  /** Namespaces the rate-limit keys per app (the same name as the app's chat route). */
  app: string;
  /** Default `process.env`. */
  env?: Env;
  /** A layer to relay through instead of the instance's shared one (`observabilityFor(env)`). */
  observability?: Observability;
}

const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * The relay for the browser's spans (`observeAgents()` posts to `/api/telemetry`), behind the same origin rule as the
 * chat and a per-IP limit (`RATE_LIMIT_TELEMETRY_PER_MINUTE`, default 60: a page sends at most one batch every 2 s).
 * With no `OTEL_*` variables it accepts and drops. The flush after a batch runs in Vercel's `waitUntil`.
 *
 * @example
 * // examples/<app>/api/telemetry.ts
 * export const { POST } = createVercelTelemetryRoute({ app: "ecommerce" });
 */
export function createVercelTelemetryRoute({ app, env = process.env, observability }: VercelTelemetryRouteOptions) {
  const layer = observability ?? observabilityFor(env);
  const relay = layer.relay({
    guard: composeGuards(
      originGuard(),
      rateLimitGuard(
        createLimiter({
          env,
          prefix: `${app}:telemetry`,
          limit: num(env.RATE_LIMIT_TELEMETRY_PER_MINUTE, 60),
          window: "1 m",
          failOpen: true,
        }),
      ),
    ),
  });
  return { POST: (req: Request) => relay(req) };
}
