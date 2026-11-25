/**
 * Every span name, attribute key and event name this package writes, in one place (design decision 8). The GenAI ones
 * follow the OpenTelemetry GenAI semantic conventions as they stood in November 2026 (status: Development, so they may
 * still be renamed upstream); the `webmcp.*` ones are this library's own.
 *
 * Use them in a `spanFilter`, a `metadataMapping` or a test instead of retyping the strings.
 *
 * @experimental The GenAI conventions are not stable yet: names may change in a minor release when they do.
 *
 * @example
 * import { ATTR_CONVERSATION_ID } from "@webmcp-agents/telemetry/server";
 * defineObservability({ metadataMapping: { [ATTR_CONVERSATION_ID]: "session.id" } });
 */

// ---------- instrumentation scope ----------

/**
 * The instrumentation scope of every span this package creates in the browser, and the only one the relay accepts.
 *
 * @experimental
 */
export const SCOPE_NAME = "@webmcp-agents/telemetry";
/**
 * The scope of the server's model spans in the `ai.*` style (`conventions: "legacy"` or `"both"`).
 *
 * @experimental
 */
export const SCOPE_NAME_LEGACY = "@webmcp-agents/telemetry/legacy";

// ---------- span names (operation; the span is "<operation> <subject>") ----------

/**
 * One agent run: `invoke_agent <agent id>` (`invoke_agent web-agent` for a run without an agent).
 *
 * @experimental
 */
export const SPAN_INVOKE_AGENT = "invoke_agent";
/**
 * One tool call on the page: `execute_tool <tool name>`.
 *
 * @experimental
 */
export const SPAN_EXECUTE_TOOL = "execute_tool";
/**
 * One model step: `chat <model>` (the server's, from the AI SDK; the browser's for an on-device run).
 *
 * @experimental
 */
export const SPAN_CHAT = "chat";
/**
 * The subject of a run span when the run has no agent.
 *
 * @experimental
 */
export const DEFAULT_AGENT_NAME = "web-agent";

// ---------- GenAI attributes ----------

/**
 * `invoke_agent`, `execute_tool` or `chat`.
 *
 * @experimental
 */
export const ATTR_OPERATION_NAME = "gen_ai.operation.name";
/**
 * The agent's id (`defineWebAgent({ id })`).
 *
 * @experimental
 */
export const ATTR_AGENT_ID = "gen_ai.agent.id";
/**
 * The tool's name.
 *
 * @experimental
 */
export const ATTR_TOOL_NAME = "gen_ai.tool.name";
/**
 * The tool call's id, as the model gave it.
 *
 * @experimental
 */
export const ATTR_TOOL_CALL_ID = "gen_ai.tool.call.id";
/**
 * The tool's input as JSON. Only with `recordInputs`, always redacted.
 *
 * @experimental
 */
export const ATTR_TOOL_CALL_ARGUMENTS = "gen_ai.tool.call.arguments";
/**
 * The tool's result as JSON. Only with `recordOutputs`, always redacted.
 *
 * @experimental
 */
export const ATTR_TOOL_CALL_RESULT = "gen_ai.tool.call.result";
/**
 * The model a step asked for.
 *
 * @experimental
 */
export const ATTR_REQUEST_MODEL = "gen_ai.request.model";
/**
 * Prompt tokens of a step.
 *
 * @experimental
 */
export const ATTR_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens";
/**
 * Generated tokens of a step.
 *
 * @experimental
 */
export const ATTR_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens";
/**
 * The error code of a failed run or call (OpenTelemetry's general `error.type`).
 *
 * @experimental
 */
export const ATTR_ERROR_TYPE = "error.type";

// ---------- webmcp attributes: ids (the same on browser and server spans) ----------

/**
 * The conversation: the same for every turn of one chat.
 *
 * @experimental
 */
export const ATTR_CONVERSATION_ID = "webmcp.conversation.id";
/**
 * The run: one user turn, one `agent.invoke`, or one sub-agent run.
 *
 * @experimental
 */
export const ATTR_RUN_ID = "webmcp.run.id";
/**
 * The model step within the run, from 1.
 *
 * @experimental
 */
export const ATTR_STEP = "webmcp.step";
/**
 * For a sub-agent's run: the id of the `delegate_to_<id>` call that started it.
 *
 * @experimental
 */
export const ATTR_PARENT_CALL_ID = "webmcp.parent.call.id";
/**
 * The agent's id, on the server's spans.
 *
 * @experimental
 */
export const ATTR_WEBMCP_AGENT_ID = "webmcp.agent.id";
/**
 * The chat session's id, on the server's spans (`createChatHandler({ session })`).
 *
 * @experimental
 */
export const ATTR_SESSION_ID = "webmcp.session.id";

// ---------- webmcp attributes: runs ----------

/**
 * The adapter that ran the model: `cloud`, `local`…
 *
 * @experimental
 */
export const ATTR_ADAPTER = "webmcp.adapter";
/**
 * How the run ended: `stop`, `max-steps`, `aborted` or `error`.
 *
 * @experimental
 */
export const ATTR_RUN_REASON = "webmcp.run.reason";
/**
 * Model steps the run took.
 *
 * @experimental
 */
export const ATTR_RUN_STEPS = "webmcp.run.steps";
/**
 * The page the run started on, redacted (origin and path; query values withheld).
 *
 * @experimental
 */
export const ATTR_PAGE = "webmcp.page";

// ---------- webmcp attributes: tool calls ----------

/**
 * How the call ended: `done`, `error` or `cancelled`.
 *
 * @experimental
 */
export const ATTR_TOOL_STATE = "webmcp.tool.state";
/**
 * The error code of a failed or cancelled call (`not_found`, `cancelled`, `needs_user`…).
 *
 * @experimental
 */
export const ATTR_TOOL_ERROR_CODE = "webmcp.tool.error.code";
/**
 * Of the call's time, the milliseconds spent waiting for the person.
 *
 * @experimental
 */
export const ATTR_TOOL_WAITED_MS = "webmcp.tool.waited_ms";
/**
 * For a call that waited for the person: `accepted`, `cancelled` or `timeout`.
 *
 * @experimental
 */
export const ATTR_TOOL_CONFIRM = "webmcp.tool.confirm";

// ---------- events on execute_tool spans ----------

/**
 * The call started waiting for the person. Attribute `prompt`: what they were asked (redacted).
 *
 * @experimental
 */
export const EVENT_PARK = "webmcp.park";
/**
 * The person interacted and the cursor got out of the way. Attribute `reason`.
 *
 * @experimental
 */
export const EVENT_YIELD = "webmcp.yield";
/**
 * The cursor came back after a yield.
 *
 * @experimental
 */
export const EVENT_RESUME = "webmcp.resume";
