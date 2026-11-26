import { defineObservability } from "@webmcp-agents/telemetry/server";

// The app registered its own provider (Sentry, @vercel/otel): the
// server's spans go through it. "provider" sends the page's spans
// through it too, with new span ids, so its processors see them.
export const observability = defineObservability({
  relayThrough: "provider",
});
