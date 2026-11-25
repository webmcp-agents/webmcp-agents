import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

/** Built as a production page: the panel's "Reveal values" must not exist there. */
const PRODUCTION = "src/store.production.browser.test.ts";
const browser = () => ({ enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" as const }] });

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions], dedupe: ["react", "react-dom"] },
  // Node tests load other workspace packages from source too: their `dist` is rewritten by the parallel build in `pnpm check`.
  ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } },
  // Pre-bundle React up front: discovering it mid-run reloads the optimizer and leaves two copies of React.
  optimizeDeps: {
    include: ["react", "react/jsx-dev-runtime", "react-dom", "react-dom/client", "@tanstack/react-devtools", "vitest-browser-react"],
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "devtools:unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.*"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "devtools:browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          exclude: [PRODUCTION],
          browser: browser(),
        },
      },
      {
        extends: true,
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        test: { name: "devtools:browser:production", include: [PRODUCTION], browser: browser() },
      },
    ],
  },
});
