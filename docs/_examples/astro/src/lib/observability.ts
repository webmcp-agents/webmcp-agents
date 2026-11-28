import { getSecret } from "astro:env/server";
import { defineObservability } from "@webmcp-agents/telemetry/server";

// One layer for the server. getSecret reads .env.local in
// development and the server's environment in production.
export const observability = defineObservability({
  serviceName: "field-store",
  env: {
    OTEL_EXPORTER_OTLP_ENDPOINT: getSecret(
      "OTEL_EXPORTER_OTLP_ENDPOINT",
    ),
    OTEL_EXPORTER_OTLP_HEADERS: getSecret("OTEL_EXPORTER_OTLP_HEADERS"),
  },
});
