import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
// The testing kit's config helper, from source: Vite loads a config with Node's resolution, where the
// `@webmcp-agents/source` condition does not apply.
import { webAgentsProject } from "../testing/src/vitest.ts";

/** Built as a production page: the panel's "Reveal values" must not exist there. */
const PRODUCTION = "src/store.production.browser.test.ts";
/** Starts before document.modelContext exists: nothing may install the polyfill first. */
const NO_WEBMCP = "src/store.late.browser.test.ts";
/** Pre-bundled up front: a dependency discovered mid-run reloads the optimizer and leaves two copies of React. */
const optimizeDeps = { include: ["@tanstack/react-devtools", "vitest-browser-react"] };

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions], dedupe: ["react", "react-dom"] },
  // Node tests load other workspace packages from source too: their `dist` is rewritten by the parallel build in `pnpm check`.
  ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } },
  test: {
    projects: [
      webAgentsProject("unit", { name: "devtools:unit", include: ["src/**/*.test.ts"] }),
      webAgentsProject("browser", {
        name: "devtools:browser",
        include: ["src/**/*.browser.test.{ts,tsx}"],
        exclude: [PRODUCTION, NO_WEBMCP],
        optimizeDeps,
      }),
      webAgentsProject("browser", {
        name: "devtools:browser:no-webmcp",
        include: [NO_WEBMCP],
        setupFiles: ["@webmcp-agents/testing/matchers"],
      }),
      webAgentsProject("browser", {
        name: "devtools:browser:production",
        include: [PRODUCTION],
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        optimizeDeps,
      }),
    ],
  },
});
