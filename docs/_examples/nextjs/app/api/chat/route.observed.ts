import { createChatHandler } from "@webmcp-agents/chat/server";

import { agents } from "@/agents";
import { observability } from "@/lib/observability";

const handler = createChatHandler({ agents, observability });

export const GET = handler;
export const POST = handler;
