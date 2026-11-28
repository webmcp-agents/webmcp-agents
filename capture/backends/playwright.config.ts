/**
 * `pnpm capture:backend <backend>` (run.mjs starts the backend first): one agent turn in Field Store on Next.js, its
 * trace in the backend's UI, one still. The app runs on its own port with the scripted model and the backend's OTLP
 * endpoint, so it never reuses a dev server started without them.
 */
import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 5186;
const MODEL_PORT = 18089;

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.backend\.ts/,
  outputDir: "../out/pw-backends",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 240_000,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    trace: "off",
    screenshot: "off",
  },
  webServer: [
    {
      command: `node capture/backends/scripted-model.mjs ${MODEL_PORT}`,
      cwd: "../..",
      url: `http://localhost:${MODEL_PORT}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm --filter @webmcp-agents/example-nextjs exec next dev -p ${APP_PORT}`,
      cwd: "../..",
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: {
        WEB_AGENTS_MODEL: "anthropic/claude-sonnet-5-5",
        ANTHROPIC_API_KEY: "scripted",
        ANTHROPIC_BASE_URL: `http://localhost:${MODEL_PORT}/v1`,
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      },
    },
  ],
});
