import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// Node-environment tests resolve like SSR: the source condition goes in ssr.resolve, or other workspace packages
// load from their (possibly stale) dist.
export default defineConfig({
  ssr: { resolve: { conditions: ["@webmcp-agents/source", ...defaultServerConditions] } },
  test: {
    name: "vercel-api",
    include: ["test/**/*.test.ts"],
    environment: "node",
    // @ai-sdk/otel brings @opentelemetry/api 1.9.1, whose "module" build has extension-less imports: Vite's SSR loader
    // picks it (Node itself uses its CJS "main"), so let Vite transform both
    server: { deps: { inline: [/@opentelemetry\/api/, /@ai-sdk\/otel/] } },
  },
});
