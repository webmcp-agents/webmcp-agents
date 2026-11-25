import {
  defineObservability,
  otlp,
} from "@webmcp-agents/telemetry/server";

// Instana agentless, written out. REGION is your tenant's region.
const region = process.env.INSTANA_REGION ?? "blue";

export const observability = defineObservability({
  exporters: [
    otlp({
      endpoint: `https://otlp-http-${region}-saas.instana.io:443`,
      protocol: "http/protobuf",
      headers: { "x-instana-key": process.env.INSTANA_AGENT_KEY ?? "" },
    }),
  ],
  resourceAttributes: {
    // An identity Instana ties the data to (here: the function).
    "faas.id": process.env.VERCEL_URL ?? "field-store",
    // Shows the traces in Instana's GenAI views.
    INSTANA_PLUGIN: "genai",
  },
});
