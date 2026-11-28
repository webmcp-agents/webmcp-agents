import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
// The kit's own source: a config is loaded with Node's resolution, where the source condition does not apply.
import { webAgentsProject } from "./src/vitest.ts";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions], dedupe: ["react", "react-dom"] },
  ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } },
  test: {
    projects: [
      webAgentsProject("unit", { name: "testing:unit", include: ["test/**/*.test.{ts,tsx}"] }),
      webAgentsProject("browser", { name: "testing:browser", include: ["test/**/*.browser.test.{ts,tsx}"] }),
      // a page without WebMCP: only the matchers, so the kit installs no polyfill
      webAgentsProject("browser", {
        name: "testing:browser:no-webmcp",
        include: ["test/no-webmcp.browser.check.ts"],
        setupFiles: ["@webmcp-agents/testing/matchers"],
      }),
    ],
  },
});
