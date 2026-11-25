import { observeAgents } from "@webmcp-agents/telemetry";

// A stand-in for your consent banner's state.
declare const consent: { analytics: boolean };

// No framework: call it once. Each run the person agreed to (read
// when the run starts) is posted to /api/telemetry.
export const stop = observeAgents({
  enabled: () => consent.analytics,
});
