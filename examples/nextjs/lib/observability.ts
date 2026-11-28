/**
 * The server's observability layer: the chat handler exports each model step through it, and /api/telemetry relays
 * the page's spans through the same one. Where spans go is the standard OTEL_* environment (see docs/observability);
 * with none set it stays off, and the app behaves as it did without it.
 */
import { defineObservability } from "@webmcp-agents/telemetry/server";

export const observability = defineObservability({ serviceName: "field-store-nextjs" });
