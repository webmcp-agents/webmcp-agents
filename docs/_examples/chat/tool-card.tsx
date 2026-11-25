import { AgentChat, type ChatComponents } from "@webmcp-agents/chat";

import { shopper } from "@/agents";

// Level 3: your own component for one part. Spread partProps on its
// root: it keeps data-wa-part, your classNames and styles.
const ToolCard: ChatComponents["ToolCard"] = ({
  partProps,
  call,
  t,
}) => (
  <div {...partProps} data-state={call.state}>
    <strong>{call.tool}</strong>{" "}
    <span>{t("tool.running", { tool: call.tool })}</span>
  </div>
);

export function Chat() {
  return <AgentChat agent={shopper} components={{ ToolCard }} />;
}
