/**
 * /api/chat: the chat handler behind origin, rate-limit and budget guards (the same route the Vite examples deploy).
 * The key and the model come from the server env; the page sends only the agent's id. The page's first GET starts a
 * chat session (a random, signed, httpOnly cookie) that every POST must carry; only the allowed tools reach the model.
 */
import { createVercelChatRoute } from "@webmcp-agents/vercel-api";
import { shopper } from "@/webmcp-agents/agents";
import { allowedTools } from "@/webmcp-agents/tools";
import { env } from "@/lib/env.server";
import { observability } from "@/lib/observability";

export const { GET, POST, OPTIONS } = createVercelChatRoute({
  app: "nextjs",
  agents: [shopper],
  tools: allowedTools,
  model: env.model,
  // off unless OTEL_* is set; the same layer relays the page's spans (app/api/telemetry/route.ts)
  observability,
});
