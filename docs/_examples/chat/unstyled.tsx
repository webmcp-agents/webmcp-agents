import { AgentChat } from "@webmcp-agents/chat";

import { shopper } from "@/agents";

// No chat.css import: only data-wa-part hooks and your classes.
export function Chat() {
  return (
    <AgentChat
      agent={shopper}
      unstyled
      classNames={{
        panel: "rounded-xl border bg-background",
        send: "btn btn-primary",
      }}
    />
  );
}
