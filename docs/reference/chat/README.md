---
slug: reference/chat
description: "A chat widget whose agent works the live page through its WebMCP tools (document.modelContext)."
---

# `@webmcp-agents/chat`

A chat widget whose agent works the live page through its WebMCP tools (`document.modelContext`). The model runs on
your server (any frontier model through the Vercel AI SDK: Claude by default, or OpenAI, Gemini, DeepSeek, Grok,
Mistral, OpenRouter, the AI Gateway) with the key server-side; every tool call runs in the browser, so the agent
cursor from `@webmcp-agents/core` plays as it does for any agent, and anything a form gates on a click waits for the
person. `defineWebAgent` gives the assistant its instructions, a tool subset and sub-agents, shared by the browser and
the server; each request is run by an AI SDK `ToolLoopAgent` built from it. The same adapter contract also takes an
on-device model ([`@webmcp-agents/local-agent`](../local-agent/README.md)). An agent can also be run from code with no chat on the page (`agent.invoke("…")`, or `useWebAgent(agent)` for live status).

## Install

```bash
pnpm add @webmcp-agents/chat
pnpm add @ai-sdk/anthropic   # the SDK of your model's provider, server only (none for the AI Gateway)
```

Peer dependencies: `react` and `react-dom` (≥ 18); optional, for the server: `@ai-sdk/anthropic`, `@ai-sdk/openai`,
`@ai-sdk/google`, `@ai-sdk/deepseek`, `@ai-sdk/xai`, `@ai-sdk/mistral`, `@openrouter/ai-sdk-provider` (the one your
model id needs); optional `vite` (≥ 6, for the dev plugin).

## Entry points

| Import | What |
|---|---|
| `@webmcp-agents/chat` | The widget, `defineWebAgent` (with `agent.invoke`), `useWebAgent`, the cloud adapter, the session hook and reducer, tool helpers, adapter types |
| `@webmcp-agents/chat/agent` | `defineWebAgent` alone: plain data, importable from `vite.config.ts` and `api/chat.ts` |
| `@webmcp-agents/chat/server` | The `/api/chat` handler, `resolveModel`, `toToolLoopAgent`, system prompt, request schema |
| `@webmcp-agents/chat/vite` | A Vite plugin that serves `/api/chat` in `vite dev` |
| `@webmcp-agents/chat/chat.css` | The widget's styles |

## Quick start

The chat panel, with the agent the page defines:

```tsx
import { AgentChat } from "@webmcp-agents/chat";
import "@webmcp-agents/chat/chat.css";

// Inside <WebAgentsProvider tools={tools}>:
<AgentChat agent={shopper} /> // no adapter needed: POSTs to /api/chat
```

The endpoint it talks to, on your server:

```ts api/chat.ts
import { createChatHandler } from "@webmcp-agents/chat/server";

const handler = createChatHandler({ agents });
export const GET = handler;
export const POST = handler;
```

And in development, the same endpoint from `vite dev`:

```ts vite.config.ts
import { webAgentsChatDev } from "@webmcp-agents/chat/vite";

// In defineConfig({ … }):
plugins: [react(), webAgentsChatDev({ agents })],
```

## APIs

| API | Entry | What it is |
|---|---|---|
| [`defineWebAgent`](./define-web-agent.md) | `@webmcp-agents/chat/agent` | An agent (instructions, tool subset, sub-agents, model) as plain data, shared by the browser and the server; `agent.invoke` runs it from code. Includes `WebAgent`, `WebAgentConfig`, `WebAgentInvokeOptions`, `WebAgentResult`, `WebAgentStep`, `selectTools`, `delegateTool`, `flattenWebAgents`. |
| [`<AgentChat>`](./agent-chat.md) | `@webmcp-agents/chat` | The launcher and docked chat panel, with `chat.css` theming. Includes `AgentChatProps`. |
| [`createChatHandler`](./create-chat-handler.md) | `@webmcp-agents/chat/server` | The `/api/chat` endpoint as a web-standard function. Includes `ChatHandlerOptions`, `DEFAULT_MODEL`, `ReasoningLevel`. |
| [`webAgentsChatDev`](./web-agents-chat-dev.md) | `@webmcp-agents/chat/vite` | A Vite plugin that serves `/api/chat` in `vite dev`. Includes `WebAgentsChatDevOptions`. |
| [`useWebAgent`](./use-web-agent.md) | `@webmcp-agents/chat` | Run an agent from a component with live status and no chat. Includes `WebAgentHandle`, `WebAgentStatus`, `UseWebAgentOptions`. |
| [`createCloudAdapter`](./create-cloud-adapter.md) | `@webmcp-agents/chat` | The adapter that talks to your `/api/chat`. Includes `CloudAdapterOptions`. |
| [`useAgentChat`](./use-agent-chat.md) | `@webmcp-agents/chat` | The chat as a `useChat`-shaped hook, to render with your own components. Includes `AgentChatState`, `ToolPhase`, `UseAgentChatOptions`. |
| [`useAgentSession`](./use-agent-session.md) | `@webmcp-agents/chat` | The conversation in the chat's own message shape. Includes `AgentSession`, `UseAgentSessionOptions`. |
| [`resolveModel`](./resolve-model.md) | `@webmcp-agents/chat/server` | A `"<provider>/<model>"` id as an AI SDK model. Includes `modelAvailability`, `parseModelId`, `providerOptionsFor`, `displayName`, `PROVIDERS`, `ModelUnavailableError`. |
| [`toToolLoopAgent`](./to-tool-loop-agent.md) | `@webmcp-agents/chat/server` | A `WebAgent` as an AI SDK `ToolLoopAgent`. Includes `toToolLoopAgentSettings`, `toToolSet`. |
| [`buildSystemPrompt`](./system-prompt.md) | `@webmcp-agents/chat/server` | The system prompt the handler sends, and `DEFAULT_SYSTEM_PROMPT`. |
| [`chatRequestSchema`](./chat-request-schema.md) | `@webmcp-agents/chat/server` | The zod schema and `LIMITS` for the POST body. Includes `ChatRequest`. |
| [Adapter types](./adapter-types.md) | `@webmcp-agents/chat` | The contract an adapter implements. Includes `AgentAdapter`, `AdapterStatus`, `AgentRunRequest`, `AgentStreamPart`, `AgentMessage`, `AgentPart`, `ToolDescriptor`, `ToolOutput`, `ToolCallState`. |
| [`callModelContextTool`](./call-model-context-tool.md) | `@webmcp-agents/chat` | Run one page tool for an agent, with a time limit and error codes. Includes `CallToolOptions`, `TOOL_TIMEOUT_MS`, `NAVIGATED`, `CANCELLED`, `isCancelled`. |
| [`listToolDescriptors`](./list-tool-descriptors.md) | `@webmcp-agents/chat` | The tools on the page right now, as a model sees them. |
| [`redactToolCall`](./redact-tool-call.md) | `@webmcp-agents/chat` | A tool call as a UI shows it: through the page's redaction rules, the tool's `sensitive` fields masked. Includes `ToolCallView`. |
| [`sessionReducer`](./session-reducer.md) | `@webmcp-agents/chat` | The session as a pure state machine. Includes `resumable`, `SessionAction`, `SessionState`, `SessionError`. |

## When a tool fails

A failed tool never ends the run: the result goes back to the model with a code (`Error [timeout]: …`), and the
system prompts say what to do per code. See [tool error codes](../core/tool-error.md) and
[`callModelContextTool`](./call-model-context-tool.md). If the run itself fails (the model, the network), Try again
resumes it from the last finished tool call ([`resumable`](./session-reducer.md#resumable)).

## Security

- The key never leaves the server; the client bundle contains no provider SDK.
- Every request is validated ([`chatRequestSchema`](./chat-request-schema.md)) and cross-site browser requests are
  refused (403).
- That is not abuse protection: a public deployment needs a `guard` ([`createChatHandler`](./create-chat-handler.md)).

## See also

- [`@webmcp-agents/local-agent`](../local-agent/README.md)
- [Tool error codes](../core/tool-error.md)
- [Deploy](../../more/deploy.md)
