import react from "@vitejs/plugin-react";
import { defaultClientConditions } from "vite";
import { defineConfig } from "vitest/config";
// The testing kit's config helper, from source: Vite loads a config with Node's resolution, where the
// `@webmcp-agents/source` condition does not apply.
import { webAgentsProject } from "../testing/src/vitest.ts";

/** The provider's devtools are development-only: these tests run as `vite dev` builds the page. */
const DEVELOPMENT = "src/provider.devtools.browser.test.tsx";
/** A browser without WebMCP: the provider loads the polyfill itself, so nothing may install it first. */
const NO_WEBMCP = "src/provider.polyfill.browser.test.tsx";
// The form tests bring their own libraries, the polyfill test renders on the server, the provider loads the
// devtools (React DOM's client and TanStack's event client): a dependency discovered mid-run reloads Vite and the
// test with it.
const optimizeDeps = {
  include: [
    "zod",
    "react-hook-form",
    "@hookform/resolvers/zod",
    "@tanstack/react-form",
    "react-dom/server.browser",
    "vitest-browser-react",
    "@webmcp-agents/devtools > @tanstack/devtools-event-client",
  ],
};

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["@webmcp-agents/source", ...defaultClientConditions], dedupe: ["react", "react-dom"] },
  test: {
    projects: [
      // NODE_ENV "test": the provider installs no devtools, as in an app's own tests.
      webAgentsProject("browser", {
        name: "react:browser",
        include: ["src/**/*.browser.test.tsx"],
        exclude: [DEVELOPMENT, NO_WEBMCP],
        optimizeDeps,
      }),
      webAgentsProject("browser", {
        name: "react:browser:development",
        include: [DEVELOPMENT],
        define: { "process.env.NODE_ENV": JSON.stringify("development") },
        optimizeDeps,
      }),
      webAgentsProject("browser", {
        name: "react:browser:no-webmcp",
        include: [NO_WEBMCP],
        setupFiles: ["@webmcp-agents/testing/matchers"],
        optimizeDeps,
      }),
    ],
  },
});
