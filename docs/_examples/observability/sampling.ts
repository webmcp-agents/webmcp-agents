import { defineObservability } from "@webmcp-agents/telemetry/server";

// Keep a turn only when the person agreed to analytics: the sampler
// gets the request, so it can read your consent cookie. The relay
// asks the same sampler, so a turn is kept or dropped whole.
export const observability = defineObservability({
  sampling: {
    type: "custom",
    sampler: ({ request }) =>
      request?.headers.get("cookie")?.includes("analytics=yes") ??
      false,
  },
});
