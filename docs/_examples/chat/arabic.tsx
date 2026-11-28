import { AgentChat } from "@webmcp-agents/chat";
import { ar } from "@webmcp-agents/chat/locales/ar";

import { shopper } from "@/agents";

// The shipped Arabic catalog, one string changed. `locale` gives
// Arabic plurals and digits, and dir="rtl": the chat mirrors.
export function Chat() {
  return (
    <AgentChat
      agent={shopper}
      locale="ar"
      messages={{ ...ar, title: "مساعد المتجر" }}
    />
  );
}
