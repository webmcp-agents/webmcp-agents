/**
 * @webmcp-agents/chat/server: the `/api/chat` handler (Node 22+, Vercel functions, `vite dev`).
 *
 *   export default { fetch: createChatHandler({ agents: [shopper] }) };   // or: export const POST = createChatHandler();
 */
export { createChatHandler, DEFAULT_MODEL } from "./handler";
export type { BeforeModelContext, ChatHandlerOptions, Effort, PrepareAgentContext } from "./handler";
// ---------- run telemetry (0.5.0, experimental) ----------
export { RUNTIME_CONTEXT_KEYS } from "./telemetry";
export type {
  ChatObservability,
  ChatRefusal,
  ChatRequestContext,
  ChatTelemetryMetadata,
  ChatTelemetryOptions,
  ChatTelemetrySettings,
} from "./telemetry";
export { validTraceparent } from "../shared";
export { SERVER_MESSAGES } from "./messages";
export type { ChatServerMessages } from "./messages";
export { applyAllowlist, buildAllowlist } from "./allowlist";
export type { Allowlist, AllowedTool } from "./allowlist";
export { createSessionKeeper, readCookie } from "./session";
export { TURNSTILE_HEADER, TURNSTILE_VERIFY_URL, turnstileVerify } from "./turnstile";
export type { TurnstileOptions } from "./turnstile";
export type { ChatSession, ChatSessionOptions, SessionKeeper } from "./session";
export { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } from "./system-prompt";
export { chatRequestSchema, chatTraceSchema, isCrossSite, LIMITS, TRACE_ID } from "./validate";
export type { ChatRequest } from "./validate";
export {
  AGENT_ID,
  DELEGATE_PREFIX,
  DELEGATION_NOTE,
  defineWebAgent,
  delegateTool,
  delegateToolName,
  flattenWebAgents,
  isDelegateTool,
  selectTools,
} from "../agent";
export type { WebAgent, WebAgentConfig } from "../agent";
export { toToolLoopAgent, toToolLoopAgentSettings, toToolSet } from "./web-agent";
export type { ToToolLoopAgentOptions, WebAgentSettings } from "./web-agent";
export {
  _resetModelCache,
  displayName,
  ModelUnavailableError,
  modelAvailability,
  parseModelId,
  PROVIDERS,
  providerOptionsFor,
  resolveModel,
} from "./models";
export type { ModelAvailability, ParsedModelId, ProviderOptions, ProviderSpec, ReasoningLevel } from "./models";
