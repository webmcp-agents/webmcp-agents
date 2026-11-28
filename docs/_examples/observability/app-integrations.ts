import { defineObservability } from "@webmcp-agents/telemetry/server";

// The app also registered @ai-sdk/otel itself. By default ("dedupe")
// the chat's calls leave it out, so each step is one span; "keep"
// records every step twice, once by each.
export const observability = defineObservability({
  appIntegrations: "keep",
});
