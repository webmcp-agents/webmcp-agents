import { defineConfig } from "tsdown";

export default defineConfig({
  // The polyfill is its own entry: `loadWebMCPPolyfill` reaches it by dynamic import, so it is a separate chunk that
  // browsers with WebMCP never download, and `@webmcp-agents/core/polyfill` imports it directly.
  // `redact` too: telemetry, the chat and the devtools import it; the main entry never does (only the control check and
  // `mask`, which the visuals share with it).
  entry: {
    index: "src/index.ts",
    "polyfill/index": "src/polyfill/index.ts",
    "polyfill/auto": "src/polyfill/auto.ts",
    "redact/index": "src/redact/index.ts",
  },
  format: "esm",
  platform: "browser",
  dts: true,
  // Shipped as separate files: consumers `import "@webmcp-agents/core/cursor.css"` (tsdown CSS bundling is experimental).
  // cursor-native.css (optional) holds Chrome's native WebMCP pseudo-classes, which some CSS parsers refuse.
  copy: [
    { from: "src/cursor.css", to: "dist" },
    { from: "src/cursor-native.css", to: "dist" },
  ],
  publint: true,
});
