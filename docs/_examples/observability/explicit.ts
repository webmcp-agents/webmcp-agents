import {
  defineObservability,
  otlp,
} from "@webmcp-agents/telemetry/server";

// The same layer, written out: every value the env would give.
export const observability = defineObservability({
  serviceName: "field-store",
  sampling: { type: "ratio", probability: 0.2 },
  exporters: [
    otlp({
      endpoint: "https://otel.example.com",
      protocol: "http/protobuf",
      headers: { "x-api-key": process.env.OTEL_KEY ?? "" },
    }),
  ],
  resourceAttributes: {
    "deployment.environment": process.env.NODE_ENV ?? "development",
  },
});
