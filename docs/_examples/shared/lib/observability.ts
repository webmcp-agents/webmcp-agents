import { defineObservability } from "@webmcp-agents/telemetry/server";

// One layer for the server: the chat handler exports each model
// step, the relay forwards the page's spans. Where spans go is the
// standard OTEL_* environment (or nothing: then it is off).
export const observability = defineObservability({
  serviceName: "field-store",
});
