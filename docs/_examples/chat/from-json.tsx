import { AgentChat, type ChatCustomization } from "@webmcp-agents/chat";

import { shopper } from "@/agents";
import config from "./chat-config.json";

// Plain JSON (a file, a CMS, a fetch): the theme, the words and
// the locale are all data.
const custom: ChatCustomization = config;

export function Chat() {
  return <AgentChat agent={shopper} {...custom} />;
}
