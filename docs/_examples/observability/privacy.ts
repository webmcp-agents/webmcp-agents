import { defineObservability } from "@webmcp-agents/telemetry/server";

export const observability = defineObservability({
  // Off by default. On, every value is still redacted, last.
  recordInputs: true,
  recordOutputs: false,

  // Your rules, merged over the defaults for this layer only.
  redact: { keys: (defaults) => [...defaults, "loyaltyId"] },
});
