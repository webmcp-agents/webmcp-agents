/**
 * @webmcp-agents/core: make a WebMCP agent's activity visible on the page.
 *
 *   import { installAgentVisuals } from "@webmcp-agents/core";
 *   import "@webmcp-agents/core/cursor.css";
 */
import "./webmcp"; // global WebMCP types (document.modelContext, SubmitEvent.agentInvoked, …)

export { installAgentVisuals } from "./visuals";
export type { AgentVisuals, AgentVisualsOptions, SpotlightOptions, YieldOptions } from "./visuals";
export { onAgentEvent, waitingForUser } from "./events";
export type { AgentEvent } from "./events";
export { UI_HOST_ATTR } from "./user-yield";

// tools
export {
  defineWebTool,
  isWebMCPAvailable,
  OPEN_TARGET_MS,
  registerWebTool,
  toModelContextTool,
  WebToolInputError,
  webToolSignature,
} from "./web-tool";
export { ConfirmationUnavailableError } from "./confirm";
export type {
  Register,
  RegisteredContext,
  TargetFn,
  ToModelContextToolOptions,
  ToolTarget,
  WebTool,
  WebToolAnnotations,
  WebToolConfig,
  WebToolContext,
} from "./web-tool";
export { locate } from "./locate";
export type { FieldTarget, ToolLocator } from "./locate";
export { createWebAgents, currentAgentVisuals, getRegisteredWebTool, inspectTools, watchPathname } from "./web-agents";
export { loadWebMCPPolyfill, whenModelContext } from "./model-context";
export type { PolyfillOption } from "./model-context";
export type { AvailableTools, ToolInspection, WebAgents, WebAgentsOptions, WebToolCatalog } from "./web-agents";
export type { ToolControls } from "./confirm";
export { createToolRegistry } from "./registry";
export type { ToolRegistry, ToolRegistryOptions } from "./registry";
export { createCallTracker, deferRelease, RESPONSE_GRACE_MS } from "./deferred";
export type { CallTracker, DeferReleaseOptions } from "./deferred";
export { matchPath } from "./path-match";
export {
  errorResult,
  errorText,
  isAbortError,
  isErrorText,
  RETRYABLE,
  toolError,
  toolErrorCode,
  toToolResult,
  WebToolError,
} from "./result";
export type { ToolErrorCode } from "./result";
export { executeTool, normalizeToolResult } from "./execute";
export type { ExecuteToolOptions } from "./execute";
export { writeControl } from "./write";
export type { FieldControl, FieldValue } from "./write";

// The WebMCP types are global (see ./webmcp). These named aliases let other packages import
// them explicitly, which also pulls the global declarations into their emitted .d.ts.
export type ModelContext = globalThis.ModelContext;
export type ModelContextTool<Args = Record<string, unknown>> = globalThis.ModelContextTool<Args>;
export type ModelContextToolInfo = globalThis.ModelContextToolInfo;
export type ModelContextToolResult = globalThis.ModelContextToolResult;
export type ModelContextExecuteOptions = globalThis.ModelContextExecuteOptions;
export type ToolEvent = globalThis.ToolEvent;
export type JSONSchema = globalThis.JSONSchema;
