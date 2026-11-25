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

## Docs

- [Add a chat](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/build/add-the-chat.mdx): setup, how a turn runs, options, picking a model, security
- [Define an agent](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/build/define-an-agent.mdx): instructions, tool subsets, sub-agents, a model per agent
- [Run the agent on the device](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/more/on-device-agent.mdx)
- [Deploy to Vercel](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/more/deploy.md)
- [API reference](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/chat/README.md)
