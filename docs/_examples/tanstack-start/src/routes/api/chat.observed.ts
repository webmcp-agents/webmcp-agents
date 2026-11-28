import { createFileRoute } from "@tanstack/react-router";
import { createChatHandler } from "@webmcp-agents/chat/server";

import { agents } from "@/agents";
import { observability } from "@/lib/observability";

const handler = createChatHandler({ agents, observability });

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
