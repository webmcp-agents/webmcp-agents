import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
// The testing kit's config helper, from source: Vite loads a config with Node's resolution, where the
// `@webmcp-agents/source` condition does not apply.
import { webAgentsProject } from "../testing/src/vitest.ts";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions], dedupe: ["react", "react-dom"] },
  // Node-environment tests resolve like SSR: without the source condition here, `@webmcp-agents/core` resolves to its
  // dist, which core's own build rewrites while turbo runs these tests (CI: "Failed to resolve entry").
  ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } },
  test: {
    projects: [
      webAgentsProject("unit", { name: "chat:node", include: ["test/**/*.test.ts"] }),
      // Pre-bundle React up front (the kit does) and the test renderer: a dependency discovered mid-run reloads the
      // optimizer and leaves two copies of React.
      webAgentsProject("browser", {
        name: "chat:browser",
        include: ["test/**/*.browser.test.{ts,tsx}"],
        optimizeDeps: { include: ["vitest-browser-react"] },
      }),
    ],
  },
});
