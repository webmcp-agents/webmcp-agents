import { defineConfig } from "tsdown";

export default defineConfig({
  // One file per entry (design §9.2). `chat` and `server` load their optional peers with a top-level await, so a
  // missing one fails at import with a sentence naming it; the other entries never touch them.
  entry: {
    index: "src/index.ts",
    matchers: "src/matchers.ts",
    setup: "src/setup.ts",
    vitest: "src/vitest.ts",
    chat: "src/chat/index.ts",
    server: "src/server/index.ts",
    telemetry: "src/telemetry/index.ts",
    playwright: "src/playwright/index.ts",
  },
  format: "esm",
  // Runs in Node (config, unit tests, Playwright) and in the browser (browser-mode tests): no platform shims.
  platform: "neutral",
  // only `./vitest` uses Node built-ins (it runs in the Vitest config)
  deps: { neverBundle: [/^node:/] },
  dts: true,
  publint: true,
});
