import { webAgentsProject } from "@webmcp-agents/testing/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [webAgentsProject("unit"), webAgentsProject("browser")],
  },
});
