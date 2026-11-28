import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// Pure logic only (parser, ranking, loop, worker protocol, Prompt API with stubs): no model is ever downloaded in tests.
export default defineConfig({
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions] },
  // Node tests that load another workspace package at runtime (chat, the testing kit) resolve like SSR: read its source
  ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } },
  test: { name: "local-agent", include: ["test/**/*.test.ts"], environment: "node" },
});
