# @webmcp-agents/local-agent

An on-device agent for [`@webmcp-agents/chat`](../chat): the model runs in the visitor's browser, through Chrome's
built-in model or transformers.js in a Web Worker. No server, no API key, and nothing the person types leaves the
device. Nothing downloads until they click Download.

```sh
pnpm add @webmcp-agents/local-agent
```

```tsx
import { AgentChat, createCloudAdapter } from "@webmcp-agents/chat";
import { createLocalAdapter } from "@webmcp-agents/local-agent";

const ADAPTERS = [createCloudAdapter(), createLocalAdapter()]; // once per page
<AgentChat adapters={ADAPTERS} />;                             // a switcher: Claude (cloud) | On-device
```

With Vite, keep the worker unbundled:

```ts
export default defineConfig({
  optimizeDeps: { exclude: ["@webmcp-agents/local-agent", "@huggingface/transformers"] },
  worker: { format: "es" },
});
```

## Docs

- [Run the agent on the device](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/more/on-device-agent.mdx): models, consent, site instructions, memory limits
- [API reference](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/local-agent/README.md)
