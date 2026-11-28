import { BraintrustSpanProcessor } from "@braintrust/otel";
import { defineObservability } from "@webmcp-agents/telemetry/server";

// BRAINTRUST_API_KEY comes from the environment.
export const observability = defineObservability({
  spanProcessors: [
    new BraintrustSpanProcessor({ parent: "project_name:field-store" }),
  ],
});
