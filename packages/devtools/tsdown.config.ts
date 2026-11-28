import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx"],
  format: "esm",
  // Not "browser": that platform replaces `process.env.NODE_ENV` at library build time, and "Reveal values" must
  // exist in development builds only, which the app's bundler decides (store.ts `development`).
  platform: "neutral",
  dts: true,
  publint: true,
});
