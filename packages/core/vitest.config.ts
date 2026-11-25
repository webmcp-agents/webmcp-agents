import { defaultClientConditions } from "vite";
import { defineConfig } from "vitest/config";
// The testing kit's config helper, from source: Vite loads a config with Node's resolution, where the
// `@webmcp-agents/source` condition does not apply, and core's tests must not need the kit built (it depends on core).
import { webAgentsProject } from "../testing/src/vitest.ts";

/** Pages that start without the polyfill: one loads it itself, one stands in a "native" document.modelContext. */
const NO_WEBMCP = ["src/web-agents.polyfill.browser.test.ts", "src/web-agents.native.browser.test.ts"];

export default defineConfig({
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions] },
  test: {
    projects: [
      webAgentsProject("unit", { name: "core:unit", include: ["src/**/*.test.ts"] }),
      // Core's own tests measure the cursor's motion: keep it (the kit's default snaps it).
      webAgentsProject("browser", {
        name: "core:browser",
        include: ["src/**/*.browser.test.ts"],
        exclude: NO_WEBMCP,
        motion: "full",
        // Browser tests define tools with zod: a dependency discovered mid-run reloads Vite and the test with it.
        optimizeDeps: { include: ["zod"] },
      }),
      // Pages without WebMCP: only the matchers, so nothing installs the polyfill before the test does.
      webAgentsProject("browser", {
        name: "core:browser:no-webmcp",
        include: NO_WEBMCP,
        setupFiles: ["@webmcp-agents/testing/matchers"],
        motion: "full",
        optimizeDeps: { include: ["zod"] },
      }),
    ],
  },
});
