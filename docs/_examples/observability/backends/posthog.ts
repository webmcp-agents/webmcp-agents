import { PostHogTraceExporter } from "@posthog/ai/otel";
import { defineObservability } from "@webmcp-agents/telemetry/server";

export const observability = defineObservability({
  exporters: [
    new PostHogTraceExporter({
      projectToken: process.env.POSTHOG_PROJECT_TOKEN ?? "",
      host: "https://us.i.posthog.com",
    }),
  ],
  // PostHog derives its session from this key.
  metadataMapping: {
    "webmcp.conversation.id": "gen_ai.conversation.id",
  },
});
