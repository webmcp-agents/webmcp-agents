/**
 * A WebAgent as an AI SDK `ToolLoopAgent`, built per request: the model (a key lives on the server), the page's live
 * tools and the agent's instructions exist together only here. Users never construct it; the handler does, and
 * `toToolLoopAgent` is exported for people who run a WebAgent inside their own AI SDK code.
 */
import { jsonSchema, type LanguageModel, type ToolSet, ToolLoopAgent, type ToolLoopAgentSettings, stepCountIs } from "ai";
import { selectTools, type WebAgent } from "../agent";
import type { ToolDescriptor } from "../types";
import { buildSystemPrompt, DEFAULT_SYSTEM_PROMPT } from "./system-prompt";
import { cleanText, sanitizeSchema } from "./validate";

/** The AI SDK `ToolLoopAgentSettings` the handler builds (any tool set, no runtime context). */
export type WebAgentSettings = ToolLoopAgentSettings<never, ToolSet>;

/** What a request brings to the agent. */
export interface ToToolLoopAgentOptions {
  /** The resolved model. */
  model: LanguageModel;
  /** The page's tools right now; the agent's `tools` filter and its delegate tools are applied here. */
  tools: readonly ToolDescriptor[];
  /** The page's same-origin path, for the "The user is on the page …" line. */
  path?: string;
  /** The base system prompt. Default `DEFAULT_SYSTEM_PROMPT`. */
  base?: string;
  /** Appended to the instructions, e.g. the tool-budget note. */
  extraInstructions?: string;
  maxOutputTokens?: number;
  providerOptions?: ToolLoopAgentSettings["providerOptions"];
  /** Default `stepCountIs(1)`: one model step per request, the browser runs the tools in between. */
  stopWhen?: ToolLoopAgentSettings["stopWhen"];
  /** Replace the tool set entirely (the handler passes `{}` once the tool budget is spent). */
  toolSet?: ToolSet;
}

/** Page tools as an AI SDK tool set with no `execute`: the model's calls stream back to the browser, which runs them. */
export function toToolSet(tools: readonly ToolDescriptor[]): ToolSet {
  return Object.fromEntries(
    tools.map((t) => [t.name, { description: cleanText(t.description), inputSchema: jsonSchema(sanitizeSchema(t.inputSchema)) }]),
  );
}

/** The `ToolLoopAgent` settings for `agent` (or the plain assistant when `agent` is undefined) on this request. */
export function toToolLoopAgentSettings(agent: WebAgent | undefined, options: ToToolLoopAgentOptions): WebAgentSettings {
  const {
    model,
    tools,
    path,
    base = DEFAULT_SYSTEM_PROMPT,
    extraInstructions,
    maxOutputTokens,
    providerOptions,
    stopWhen,
    toolSet,
  } = options;
  let instructions = buildSystemPrompt(base, path, agent?.instructions, (agent?.agents.length ?? 0) > 0);
  if (extraInstructions) instructions += `\n\n${extraInstructions}`;
  return {
    id: agent?.id,
    model,
    instructions,
    tools: toolSet ?? toToolSet(selectTools(agent, tools)),
    stopWhen: stopWhen ?? stepCountIs(1),
    maxOutputTokens,
    providerOptions,
  };
}

/** `new ToolLoopAgent(toToolLoopAgentSettings(agent, options))`. */
export function toToolLoopAgent(agent: WebAgent | undefined, options: ToToolLoopAgentOptions): ToolLoopAgent<never, ToolSet> {
  // explicit type arguments: inference would pick an `Output` type from the absent `output` setting
  return new ToolLoopAgent<never, ToolSet>(toToolLoopAgentSettings(agent, options));
}
