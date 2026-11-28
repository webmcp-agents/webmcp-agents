import { AgentChat } from "@webmcp-agents/chat";

import { shopper } from "@/agents";
import { messages } from "./messages";
import { theme } from "./theme";

// Declared once, outside the render: the same objects every time.
export function Chat() {
  return (
    <AgentChat
      agent={shopper}
      theme={theme}
      messages={messages}
      classNames={{ panel: "shadow-2xl" }}
      styles={{ launcher: { insetInlineEnd: 24 } }}
    />
  );
}
