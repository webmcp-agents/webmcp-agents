import { defineConfig } from "tsdown";

export default defineConfig({
  // `.` runs in the browser, `./server` on Node / the edge, `./react` wherever React does. The OpenTelemetry packages and
  // `@ai-sdk/otel` are optional peers loaded by literal `import()` on first use (external, never bundled); the browser's
  // bridge to a page's own provider is a chunk of its own, reached only by dynamic import.
  entry: {
    index: "src/index.ts",
    server: "src/server/index.ts",
    react: "src/react.tsx",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  deps: { neverBundle: [/^node:/] },
  publint: true,
});
