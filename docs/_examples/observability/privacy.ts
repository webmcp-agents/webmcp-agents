import { defineObservability } from "@webmcp-agents/telemetry/server";

export const observability = defineObservability({
  // Off by default. On, every value is still redacted, last.
  recordInputs: true,
  recordOutputs: false,

  // Group a conversation's traces in a backend. The target key is
  // exported as is: never map something you would not send.
  metadataMapping: { "webmcp.conversation.id": "session.id" },

  // Your rules, merged over the defaults for this layer only.
  redact: { keys: (defaults) => [...defaults, "loyaltyId"] },
});
