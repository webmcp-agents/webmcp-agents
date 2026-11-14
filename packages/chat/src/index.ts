/**
 * @webmcp-agents/chat: a chat widget whose agent works the live page through its WebMCP tools.
 *
 *   import { AgentChat, createCloudAdapter } from "@webmcp-agents/chat";
 *   import "@webmcp-agents/chat/chat.css";
 *   <AgentChat agent={shopper} />                 // POSTs to /api/chat (see @webmcp-agents/chat/server)
 *
 *   const { text } = await shopper.invoke("Reorder my last purchase.");   // no chat on the page
 *   const agent = useWebAgent(shopper);                                   // the same, with live status
 */
export { AgentChat } from "./components/AgentChat";
export type { AgentChatProps } from "./components/AgentChat";
export {
  AGENT_ID,
  DELEGATE_PREFIX,
  defineWebAgent,
  delegateTool,
  delegateToolName,
  flattenWebAgents,
  isDelegateTool,
  selectTools,
} from "./agent";
export type { WebAgent, WebAgentConfig, WebAgentInvokeOptions, WebAgentResult, WebAgentStep } from "./agent";
export { createCloudAdapter } from "./adapter/cloud";
export type { CloudAdapterOptions } from "./adapter/cloud";
export { turnstileHeaders } from "./adapter/turnstile";
export type { TurnstileHeadersOptions } from "./adapter/turnstile";
export { useAgentChat } from "./session/use-agent-chat";
export type { AgentChat as AgentChatState, ToolPhase, UseAgentChatOptions } from "./session/use-agent-chat";
export { useWebAgent } from "./session/use-web-agent";
export type { UseWebAgentOptions, WebAgentHandle, WebAgentStatus } from "./session/use-web-agent";
export { useAgentSession } from "./session/use-agent-session";
export type { AgentSession, UseAgentSessionOptions } from "./session/use-agent-session";
export { resumable, sessionReducer } from "./session/reducer";
export type { SessionAction, SessionError, SessionState } from "./session/reducer";
export type { RestoreResult } from "./session/restore-journal";
export { CANCELLED, displayName, isCancelled } from "./shared";
export { callModelContextTool, listToolDescriptors, NAVIGATED, TOOL_TIMEOUT_MS } from "./tools";
export type { CallToolOptions } from "./tools";
export type * from "./types";
