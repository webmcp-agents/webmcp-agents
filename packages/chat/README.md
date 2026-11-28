# @webmcp-agents/chat

A chat widget whose agent works the **live page** through its WebMCP tools. The model runs on your server (any frontier
model through the Vercel AI SDK: Claude by default, or OpenAI, Gemini, DeepSeek, Grok, Mistral, OpenRouter, the AI
Gateway) with the key server-side; every tool call runs **in the browser**, under the agent cursor, and anything a form
gates on a click waits for the person. `defineWebAgent` gives the assistant its instructions, a tool subset and
sub-agents, shared by the browser and the server, and runnable from code with `agent.invoke(…)`.

```sh
pnpm add @webmcp-agents/chat @ai-sdk/anthropic   # the SDK of your provider, server only
```

```ts
// src/agents.ts: shared by the page, vite.config.ts and api/chat.ts (plain data, no secrets)
import { defineWebAgent } from "@webmcp-agents/chat/agent";
export const shopper = defineWebAgent({
  id: "shopper",
  instructions: "Find products with search_products; open one before adding it.",
  tools: [tools.getCart, "search_products"], // tool objects or ids
});
```

```tsx
import { AgentChat } from "@webmcp-agents/chat";
import "@webmcp-agents/chat/chat.css";

<WebAgentsProvider tools={tools}>
  <App />
  <AgentChat agent={shopper} />
</WebAgentsProvider>;
```

With no `adapter` or `adapters`, the chat POSTs to `/api/chat` (one shared `createCloudAdapter()`); pass them to add the
on-device model or a custom one. To run an agent with no chat on the page:

```ts
const { text } = await shopper.invoke("Reorder my last purchase and stop at checkout.");
```

```tsx
// In a component, with live status.
export function ReorderButton() {
  const agent = useWebAgent(shopper);

  return (
    <Button
      onClick={() => agent.invoke("Reorder my last purchase.")}
      disabled={agent.status === "running"}
    >
      {agent.status === "running" ? "Working…" : "Reorder"}
    </Button>
  );
}
```

`agent.invoke` runs in the browser (the agent's tools are the page's tools; on the server it rejects) and takes
`{ adapter?, signal?, onStep? }`. `useWebAgent(agent)` returns `{ invoke, stop, status, steps, text, error }`, where
`status` is `idle`, `running`, `waiting` (a tool is parked on the person's click) or `error`.

```ts
// api/chat.ts: any runtime with web Request/Response
import { createChatHandler } from "@webmcp-agents/chat/server";
import { shopper } from "../src/agents";
const handler = createChatHandler({ agents: [shopper] });   // model: WEB_AGENTS_MODEL, e.g. openai/gpt-5.5 with OPENAI_API_KEY
export const GET = handler;
export const POST = handler;
```

In development, `webAgentsChatDev({ agents: [shopper] })` from `@webmcp-agents/chat/vite` serves `/api/chat`; put the
provider's key in `.env.local` (never with a `VITE_` prefix: the plugin refuses it). A public deployment needs rate
limits and a budget.

## Look and language

Every color, size and duration is a `--wa-chat-*` variable, every string comes from a catalog, and every element
carries a `data-wa-part` hook, so the chat changes without a fork:

```tsx
import { ar } from "@webmcp-agents/chat/locales/ar"; // Arabic and Spanish ship separately

<AgentChat
  agent={shopper}
  theme={{ color: { accent: "#0f62fe" }, radius: { panel: "16px" } }} // or :root { --wa-chat-color-accent: … }
  messages={{ title: "Field Store assistant", composer: { placeholder: "Ask about an order" } }}
  classNames={{ send: "btn btn-primary" }}
  components={{ ToolCard: MyToolCard }} // replace any part; `unstyled` drops the library CSS
/>;
<AgentChat locale="ar" messages={ar} />; // right to left, Arabic plurals and digits
```

Failures reach the chat as codes and are worded from the catalog; `useAgentChat({ messages, locale })` gives a UI of
your own the same words (`error.text`, `t`). The 0.4.0 variables, props and `data-theme` behavior keep working.

## Run telemetry (experimental)

Every run reports what happened, in order, with ids the server's spans share. No telemetry package needed:

```ts
import { onAgentRun } from "@webmcp-agents/chat";

onAgentRun((e) => {
  if (e.type === "run-finish") analytics.track("agent_run", { reason: e.reason, steps: e.steps, ms: Math.round(e.ms) });
});
```

Tool inputs and outputs arrive redacted unless `onAgentRun(listener, { raw: true })`. On the server, each step's spans
carry the conversation, run, step, agent and session ids and no content by default; `createChatHandler({ telemetry,
observability })` opts into content, adds attributes, reports refusals (`onRefused`) and plugs in a layer such as
`@webmcp-agents/telemetry`. Nothing touches global telemetry state.

## Docs

- [Add a chat](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/build/add-the-chat.mdx): setup, how a turn runs, options, picking a model, security
- [Define an agent](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/build/define-an-agent.mdx): instructions, tool subsets, sub-agents, a model per agent
- [Run the agent on the device](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/more/on-device-agent.mdx)
- [Deploy to Vercel](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/more/deploy.md)
- [Theme](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/chat-theme.md), [messages](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/chat-messages.md), [parts](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/chat-parts.md) and [components](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/chat-components.md)
- [Run events](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/on-agent-run.md) and [the handler's telemetry](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/create-chat-handler.md#telemetry)
- [API reference](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/README.md)
