"use client";

import { ObserveAgents } from "@webmcp-agents/telemetry/react";

import { consent } from "@/lib/consent";

// Render it once, inside <WebAgentsProvider>. Each run the person
// agreed to becomes spans, posted to /api/telemetry.
export function ObserveRuns() {
  return <ObserveAgents enabled={() => consent.analytics} />;
}
