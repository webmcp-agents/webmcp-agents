import * as openinference from "@arizeai/openinference-vercel";
import * as proto from "@opentelemetry/exporter-trace-otlp-proto";
import { defineObservability } from "@webmcp-agents/telemetry/server";

// Arize AX. For Phoenix: url "http://localhost:6006/v1/traces"
// and an `authorization: Bearer <PHOENIX_API_KEY>` header.
const exporter = new proto.OTLPTraceExporter({
  url: "https://otlp.arize.com/v1/traces",
  headers: {
    "arize-space-id": process.env.ARIZE_SPACE_ID ?? "",
    "arize-api-key": process.env.ARIZE_API_KEY ?? "",
  },
});

export const observability = defineObservability({
  spanProcessors: [
    new openinference.OpenInferenceBatchSpanProcessor({
      exporter,
    }),
  ],
  // Arize files traces under this project.
  resourceAttributes: { "openinference.project.name": "field-store" },
  metadataMapping: { "webmcp.conversation.id": "session.id" },
});
