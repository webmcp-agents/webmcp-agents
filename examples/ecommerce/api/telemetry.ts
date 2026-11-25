// /api/telemetry on Vercel: the relay for the browser's spans (observeAgents), behind the chat's origin rule and a
// per-IP limit. Off (accepts and drops) unless the deployment sets OTEL_EXPORTER_OTLP_* (see docs/more/deploy.md).
import { createVercelTelemetryRoute } from "@webmcp-agents/vercel-api";

export const { POST } = createVercelTelemetryRoute({ app: "ecommerce" });
