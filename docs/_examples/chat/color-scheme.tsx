import { AgentChat } from "@webmcp-agents/chat";

import { shopper } from "@/agents";
import { theme } from "./theme";

// Your site's own switch decides: "light" or "dark" always win
// over the system setting. "auto" (the default) follows it.
export function Chat({ dark }: { dark: boolean }) {
  return (
    <AgentChat
      agent={shopper}
      theme={theme}
      colorScheme={dark ? "dark" : "light"}
    />
  );
}
