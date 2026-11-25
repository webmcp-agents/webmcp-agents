import { createChatHandler } from "@webmcp-agents/chat/server";

import { observability } from "../src/lib/observability";
import { agents } from "../src/agents";

const handler = createChatHandler({ agents, observability });

export const GET = handler;
export const POST = handler;
