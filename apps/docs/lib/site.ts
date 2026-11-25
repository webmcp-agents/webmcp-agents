/** Where the site's links and tools point. The docs are the same site, mounted under /docs (blume.config.ts `basePath`). */
export const REPO = "https://github.com/webmcp-agents/webmcp-agents";
export const DOCS = "/docs";
export const DEMOS = "/demos";
export const QUICKSTART = `${DOCS}/installation`;
export const INSTALL_COMMAND = "pnpm add @webmcp-agents/core @webmcp-agents/react @webmcp-agents/chat";

/** The docs pages a tool (`open_docs`) can open by name: the ones a visitor asks for first. Paths are under DOCS. */
export const DOCS_PAGES = {
  quickstart: { title: "Installation", path: "/installation" },
  tools: { title: "Define a tool", path: "/build/define-a-tool" },
  "agent-cursor": { title: "The agent cursor", path: "/concepts/agent-cursor" },
  "define-web-tool": { title: "defineWebTool", path: "/reference/core/define-web-tool" },
  chat: { title: "Add the chat", path: "/build/add-the-chat" },
  agents: { title: "Define an agent", path: "/build/define-an-agent" },
  polyfill: { title: "The polyfill", path: "/more/polyfill" },
  vite: { title: "Install in a Vite app", path: "/installation/vite" },
  nextjs: { title: "Install in a Next.js app", path: "/installation/nextjs" },
  "tanstack-start": { title: "Install in a TanStack Start app", path: "/installation/tanstack-start" },
  astro: { title: "Install in an Astro site", path: "/installation/astro" },
  reference: { title: "API reference", path: "/reference" },
} as const;
export type DocsPage = keyof typeof DOCS_PAGES;
