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
export type { AgentChat as AgentChatState, AgentChatError, ToolPhase, UseAgentChatOptions } from "./session/use-agent-chat";
// ---------- customization: theme, messages, parts (0.5.0) ----------
export { en } from "./customize/en";
export { createTranslator, deepMerge, directionOf } from "./customize/translate";
export { defineChatMessages, defineChatTheme, themeToCssVars } from "./customize/theme";
export type { ChatCssVar } from "./customize/theme";
export { CHAT_ERROR_CODES, chatErrorCode } from "./customize/errors";
export { THEME_TOKENS } from "./customize/tokens";
export { CHAT_PARTS } from "./customize/parts";
export { adapterLabel } from "./components/AdapterSwitcher";
export type {
  ChatComponents,
  ChatCustomization,
  ChatErrorCode,
  ChatFormat,
  ChatMessages,
  ChatMessagesInput,
  ChatPart,
  ChatTheme,
  ChatThemeInput,
  DeepPartial,
  IconName,
  Message,
  MessageKey,
  MessageValues,
  PartProps,
  Translate,
} from "./customize/types";
// ---------- run telemetry (0.5.0, experimental) ----------
export { onAgentRun } from "./session/run-events";
export type { AgentRunEvent, AgentRunListener, OnAgentRunOptions, RunRef, StepUsage } from "./session/run-events";
export { useWebAgent } from "./session/use-web-agent";
export type { UseWebAgentOptions, WebAgentHandle, WebAgentStatus } from "./session/use-web-agent";
export { useAgentSession } from "./session/use-agent-session";
export type { AgentSession, UseAgentSessionOptions } from "./session/use-agent-session";
export { canRestoreTo, resumable, sessionReducer } from "./session/reducer";
export type { SessionAction, SessionError, SessionState } from "./session/reducer";
export type { RestoreResult } from "./session/restore-journal";
export type { ChatRestoreSnapshot, ChatRestoreSnapshots } from "./session/restore-snapshot";
export { snapshotsStorageKey } from "./session/restore-snapshot";
export { CANCELLED, displayName, isCancelled } from "./shared";
export { callModelContextTool, listToolDescriptors, NAVIGATED, TOOL_TIMEOUT_MS } from "./tools";
export { redactToolCall } from "./redact";
export type { ToolCallView } from "./redact";
export type { CallToolOptions } from "./tools";
export type * from "./types";
