/**
 * `defineWebAgent`: one agent definition, shared by the browser and the server, the way `defineWebTool` is one tool
 * definition. A WebAgent is plain data (an id, instructions, which page tools it may use, its sub-agents, a model id):
 *
 *   - the browser filters the page's tools through it, runs sub-agents under the cursor, and feeds the on-device model;
 *   - the server looks the agent up by id (the page sends only the id, never instructions) and turns it into an AI SDK
 *     `ToolLoopAgent` for the request (`@webmcp-agents/chat/server`).
 *
 * Sub-agents follow the AI SDK pattern "an agent exposed as a tool": each one becomes a `delegate_to_<id>` tool the
 * parent can call with a task. The chat runs the sub-agent's own loop and hands its answer back as the tool's result.
 *
 * Every agent can also be run from code, with no chat on the page: `await shopper.invoke("Reorder my last purchase.")`.
 *
 * No DOM, React, `ai` or zod here: this module is imported by the browser bundle, `vite.config.ts` and `api/chat.ts`.
 * `invoke` loads the browser loop with a dynamic `import()` on its first call.
 */
import type { WebTool } from "@webmcp-agents/core";
import type { AgentAdapter, AgentMessage, ToolCallState, ToolDescriptor, ToolOutput } from "./types";

/** Agent ids: the tool charset, kept short so `delegate_to_<id>` stays a valid tool name. */
export const AGENT_ID = /^[a-zA-Z0-9_.-]{1,64}$/;
/** The prefix of the tool a parent agent calls to hand a task to a sub-agent. */
export const DELEGATE_PREFIX = "delegate_to_";

/** What `defineWebAgent` takes. */
export interface WebAgentConfig {
  /** The agent's name, 1–64 of `a-z A-Z 0-9 _ . -` (e.g. "shopper"). The browser sends it; the server looks it up. */
  id: string;
  /** When this agent is a sub-agent: what it does, for the parent's `delegate_to_<id>` tool description. One sentence. */
  description?: string;
  /**
   * What the agent knows about this site: the flow its tools form, what to ask for, what to avoid. One string or
   * several lines. Appended to the system prompt on the server (cloud) or in the browser (on-device).
   */
  instructions: string | readonly string[];
  /**
   * Which of the page's tools this agent may use: a list of tools (`tools.getCart`, from `defineWebTool`) or tool
   * ids (`"get_cart"`), mixed freely, or a function over the page's current tool descriptors. A listed tool is used
   * while it is registered on the page; page order is kept. Default: every tool on the page.
   */
  tools?: readonly (string | WebTool)[] | ((tools: ToolDescriptor[]) => ToolDescriptor[]);
  /** Sub-agents: each becomes a `delegate_to_<id>` tool. Their ids must be unique across the whole tree. */
  agents?: readonly WebAgent[];
  /**
   * The model for this agent, as a `"<provider>/<model>"` id (see `resolveModel`), e.g. a cheaper model for a
   * sub-agent. A string, never a key. Default: the handler's model.
   */
  model?: string;
  /** Model steps per user message for this agent; beats the adapter's and the handler's `maxSteps`. */
  maxSteps?: number;
}

/** A defined agent: frozen data every runtime reads, plus `invoke` to run it from code. */
export interface WebAgent extends Readonly<Omit<WebAgentConfig, "instructions" | "agents" | "tools">> {
  readonly instructions: readonly string[];
  readonly agents: readonly WebAgent[];
  /** The tools it may use, as ids (tool objects given to `defineWebAgent` become their ids), or the filter function. */
  readonly tools?: readonly string[] | ((tools: ToolDescriptor[]) => ToolDescriptor[]);
  /**
   * Run the agent on one message, with no chat on the page: it calls the page's tools (the cursor moves, fields are
   * typed, confirmations wait for the person's click) until it answers. Each call is a fresh conversation.
   *
   *   const { text } = await shopper.invoke("Reorder my last purchase and stop at checkout.");
   *
   * Browser only: on the server it rejects (register the agent with `createChatHandler({ agents })` there). Rejects
   * when the run fails (an `Error` with the adapter's message and `code`), and with an `AbortError` when
   * `options.signal` aborts. The browser loop is loaded on the first call.
   */
  invoke(text: string, options?: WebAgentInvokeOptions): Promise<WebAgentResult>;
}

/** Options for `agent.invoke`. */
export interface WebAgentInvokeOptions {
  /** Runs the model. Default: one shared `createCloudAdapter()` (your `/api/chat`). */
  adapter?: AgentAdapter;
  /** Aborting it stops the run: the model, the tool in flight, any sub-agent. `invoke` then rejects with an AbortError. */
  signal?: AbortSignal;
  /** Called whenever a tool call starts, parks on the person's confirmation, or ends: for progress UI. */
  onStep?(step: WebAgentStep): void;
}

/** One tool call an agent made during a run (a sub-agent's calls included). */
export interface WebAgentStep {
  /** The call's id. */
  id: string;
  /** The tool's name (`add_to_cart`, or `delegate_to_<id>` for a hand-off to a sub-agent). */
  tool: string;
  /** The arguments the model sent. */
  input: unknown;
  /** `awaiting-confirmation`: parked on the page until the person clicks (`prompt` says what). */
  state: ToolCallState;
  /** The tool's result, once done. */
  output?: ToolOutput;
  /** The error's text, when it failed or was cancelled. */
  error?: string;
  /** While awaiting confirmation: what the person should click. */
  prompt?: string;
  /** The sub-agent that made this call, when it was not the agent itself. */
  agent?: string;
}

/** What a finished `agent.invoke` resolves to. */
export interface WebAgentResult {
  /** The agent's answer: the text of its replies in this run, joined. */
  text: string;
  /** Every tool call it made, in order (a sub-agent's calls included, with `agent` set). */
  steps: WebAgentStep[];
  /** The whole conversation: the user's message, then the agent's replies with their tool calls. */
  messages: AgentMessage[];
}

const isAgent = (value: unknown): value is WebAgent =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as WebAgent).id === "string" &&
  Array.isArray((value as WebAgent).instructions) &&
  Array.isArray((value as WebAgent).agents);

/**
 * Define an agent: validates, normalizes `instructions` to lines and freezes the result. Throws a `TypeError` that
 * names the fix, like `defineWebTool`.
 */
export function defineWebAgent(config: WebAgentConfig): WebAgent {
  const { id, description, tools, model, maxSteps } = config;
  if (typeof id !== "string" || !AGENT_ID.test(id)) {
    throw new TypeError(`WebAgent id ${JSON.stringify(id)} is invalid: use 1–64 letters, digits, "_", "." or "-" (e.g. "shopper").`);
  }
  const instructions = (typeof config.instructions === "string" ? [config.instructions] : [...(config.instructions ?? [])])
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter(Boolean);
  if (instructions.length === 0)
    throw new TypeError(`WebAgent "${id}" needs instructions: what the site is and how its tools fit together.`);
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 1)) {
    throw new TypeError(`WebAgent "${id}": maxSteps must be a positive integer, got ${JSON.stringify(maxSteps)}.`);
  }
  if (tools !== undefined && typeof tools !== "function" && !Array.isArray(tools)) {
    throw new TypeError(`WebAgent "${id}": tools must be a list of tool ids or a function over the page's tools.`);
  }
  // a tool object stands for its id: structural, so a tool from either copy of core (source and dist) counts
  const toolIds = Array.isArray(tools)
    ? tools.map((tool: unknown) => {
        if (typeof tool === "string") return tool;
        const toolId = (tool as WebTool | null)?.id;
        if (typeof tool === "object" && typeof toolId === "string") return toolId;
        throw new TypeError(`WebAgent "${id}": every entry of tools must be a tool id or a tool from defineWebTool().`);
      })
    : undefined;
  const agents = [...(config.agents ?? [])];
  for (const sub of agents) {
    // structural, not instanceof: dev resolves this module from source and dist at once, so two copies may coexist
    if (!isAgent(sub)) throw new TypeError(`WebAgent "${id}": every entry of agents must come from defineWebAgent().`);
  }
  const agent: WebAgent = Object.freeze({
    id,
    description,
    instructions: Object.freeze(instructions),
    tools: toolIds ? Object.freeze(toolIds) : (tools as WebAgent["tools"]),
    agents: Object.freeze(agents),
    model,
    maxSteps,
    invoke: (text: string, options?: WebAgentInvokeOptions) => invokeWebAgent(agent, text, options),
  });
  flattenWebAgents([agent]); // duplicate ids anywhere in the tree are a definition error, found here, not per request
  return agent;
}

/** `agent.invoke`: refuse where there is no page, else load the browser loop (once) and run. */
async function invokeWebAgent(agent: WebAgent, text: string, options?: WebAgentInvokeOptions): Promise<WebAgentResult> {
  if (typeof document === "undefined") {
    throw new Error(
      `${agent.id}.invoke() runs in the browser: the agent's tools are the page's tools. On the server, register the agent with createChatHandler({ agents }) instead.`,
    );
  }
  const { invokeAgent } = await import("./session/run-agent");
  return invokeAgent(agent, text, options);
}

/** Every agent in the trees, by id (parents and sub-agents alike). Throws on a duplicate id. */
export function flattenWebAgents(agents: readonly WebAgent[]): Map<string, WebAgent> {
  const all = new Map<string, WebAgent>();
  const visit = (agent: WebAgent): void => {
    if (all.has(agent.id)) throw new TypeError(`WebAgent id "${agent.id}" is used twice: every agent and sub-agent needs its own id.`);
    all.set(agent.id, agent);
    for (const sub of agent.agents) visit(sub);
  };
  for (const agent of agents) visit(agent);
  return all;
}

/** `delegate_to_<id>`: the tool a parent calls to hand a task to the sub-agent `id`. */
export const delegateToolName = (agentId: string): string => `${DELEGATE_PREFIX}${agentId}`;
/** True for a `delegate_to_<id>` tool name. */
export const isDelegateTool = (toolName: string): boolean => toolName.startsWith(DELEGATE_PREFIX);

/** The tool descriptor a parent sees for the sub-agent `sub`: a task, and what it should know. */
export function delegateTool(sub: WebAgent): ToolDescriptor {
  const what = sub.description?.trim() || `Hand a task to the ${sub.id} agent.`;
  const own = Array.isArray(sub.tools) && sub.tools.length ? ` Its tools: ${sub.tools.join(", ")}.` : "";
  return {
    name: delegateToolName(sub.id),
    description: `${what} It works this page with its own tools and answers with what it did and found. Give it one complete task; it sees nothing else of this conversation.${own}`,
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: 'A complete, self-contained task, e.g. "Check out with promo code WELCOME".' },
        context: { type: "string", description: "Facts it needs: choices the user made, values already known." },
      },
      required: ["task"],
    },
  };
}

/** One line the model gets when it has sub-agents. */
export const DELEGATION_NOTE =
  'Tools named delegate_to_<agent> hand one self-contained task to a specialised agent that works this page itself and answers with what it did. Delegate the whole task at once and don\'t redo its work. Its answer is already shown to the user in the chat, word for word: never repeat or summarise it. Add a sentence only when something is left for the user to do or decide; otherwise reply with a two-word acknowledgement, such as "All set."';

/**
 * The tools an agent sees: the page's tools through its `tools` filter, plus one delegate tool per sub-agent. Delegate
 * tools arriving from outside are dropped (the server rebuilds them from its own registry), and a page tool named
 * like a delegate loses to the delegate. With no agent, the page's tools as they are.
 */
export function selectTools(agent: WebAgent | undefined, tools: readonly ToolDescriptor[]): ToolDescriptor[] {
  const page = tools.filter((t) => !isDelegateTool(t.name));
  if (!agent) return page;
  let own: ToolDescriptor[];
  if (typeof agent.tools === "function") own = agent.tools([...page]);
  else if (agent.tools) {
    const allowed = new Set(agent.tools);
    own = page.filter((t) => allowed.has(t.name));
  } else own = page;
  return [...own, ...agent.agents.map(delegateTool)];
}
