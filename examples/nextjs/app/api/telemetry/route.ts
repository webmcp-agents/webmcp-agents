/**
 * /api/telemetry: the page's spans (`<ObserveAgents>` in app/providers.tsx) arrive here, behind the chat route's
 * origin rule (no Origin, no relay) and a per-IP limit (RATE_LIMIT_TELEMETRY_PER_MINUTE, default 60). The relay checks
 * and redacts them, then sends them where the server's spans go; with no OTEL_* variables it accepts and drops them.
 */
import { createVercelTelemetryRoute } from "@webmcp-agents/vercel-api";
import { observability } from "@/lib/observability";

// the same layer as app/api/chat/route.ts: one exporter and one batch for the server's spans and the page's
export const { POST } = createVercelTelemetryRoute({ app: "nextjs", observability });
