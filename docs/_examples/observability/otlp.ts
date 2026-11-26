import {
  defineObservability,
  otlp,
} from "@webmcp-agents/telemetry/server";

// Two destinations, each with its own URL and key. The env's headers
// never reach a target that has its own URL.
export const observability = defineObservability({
  exporters: [
    otlp({
      endpoint: "https://otel.example.com",
      headers: { "x-api-key": process.env.OTEL_KEY ?? "" },
    }),
    otlp({
      endpoints: {
        traces: "https://traces.example.com/ingest?tenant=acme",
      },
      protocol: "http/protobuf",
    }),
  ],
});
