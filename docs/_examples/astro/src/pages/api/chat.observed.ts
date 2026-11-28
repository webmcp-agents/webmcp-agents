import type { APIRoute } from "astro";
import { getSecret } from "astro:env/server";
import { createChatHandler } from "@webmcp-agents/chat/server";

import { agents } from "@/agents";
import { observability } from "@/lib/observability";

export const prerender = false;

const handler = createChatHandler({
  agents,
  observability,
  env: {
    ANTHROPIC_API_KEY: getSecret("ANTHROPIC_API_KEY"),
    WEB_AGENTS_MODEL: getSecret("WEB_AGENTS_MODEL"),
  },
});

export const GET: APIRoute = ({ request }) => handler(request);
export const POST: APIRoute = ({ request }) => handler(request);
