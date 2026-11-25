import { createFileRoute } from "@tanstack/react-router";

import { observability } from "@/lib/observability";

// The page's spans arrive here. The relay checks and redacts them,
// then sends them where the server's spans go.
const relay = observability.relay();

export const Route = createFileRoute("/api/telemetry")({
  server: {
    handlers: {
      POST: ({ request }) => relay(request),
    },
  },
});
