import react from "@vitejs/plugin-react";
import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";
// The testing kit's config helper, from source: Vite loads a config with Node's resolution, where the
// `@webmcp-agents/source` condition does not apply.
import { webAgentsProject } from "../testing/src/vitest.ts";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions], dedupe: ["react", "react-dom"] },
  // Node tests import chat and core from source too (else they load a dist another task may be rebuilding)
  ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } },
  test: {
    projects: [
      webAgentsProject("unit", {
        name: "telemetry:node",
        include: ["test/**/*.test.ts"],
        // @ai-sdk/otel brings @opentelemetry/api 1.9.1, whose "module" build has extension-less imports: Vite's SSR
        // loader picks it (Node itself uses its CJS "main"), so let Vite transform it
        test: { server: { deps: { inline: [/@opentelemetry\/api/, /@ai-sdk\/otel/] } } },
      }),
      // Pre-bundle what the browser tests load mid-run (a dependency found later reloads Vite: two Reacts)
      webAgentsProject("browser", {
        name: "telemetry:browser",
        include: ["test/**/*.browser.test.{ts,tsx}"],
        optimizeDeps: { include: ["vitest-browser-react", "@opentelemetry/api", "@opentelemetry/sdk-trace"] },
      }),
    ],
  },
});
