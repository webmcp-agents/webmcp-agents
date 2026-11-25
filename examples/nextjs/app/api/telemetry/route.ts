/**
 * /api/telemetry: the page's spans (`<ObserveAgents>` in app/providers.tsx) arrive here. The relay checks and redacts
 * them, then sends them where the server's spans go; with no OTEL_* variables it accepts and drops them.
 */
import { observability } from "@/lib/observability";

export const POST = observability.relay();
