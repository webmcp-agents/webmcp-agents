import { defineConfig } from "tsdown";

export default defineConfig({
  // One build for the browser entry and the server/vite entries: everything platform-specific is external.
  entry: {
    index: "src/index.ts",
    agent: "src/agent.ts",
    server: "src/server/index.ts",
    vite: "src/vite/index.ts",
    // one entry per locale, so a page ships only the ones it imports
    "locales/ar": "src/locales/ar.ts",
    "locales/es": "src/locales/es.ts",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  deps: { neverBundle: [/^node:/] },
  // Shipped as a separate file: consumers `import "@webmcp-agents/chat/chat.css"` (like core's cursor.css).
  copy: [{ from: "src/chat.css", to: "dist" }],
  publint: true,
});
