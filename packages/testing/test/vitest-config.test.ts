import { describe, expect, test } from "vitest";
import { webAgentsProject } from "../src/vitest";

describe("webAgentsProject", () => {
  test('"unit" runs *.test.* in Node with the matchers', () => {
    const project = webAgentsProject("unit");
    expect(project).toMatchObject({
      extends: true,
      test: { name: "unit", environment: "node", include: ["**/*.test.{ts,tsx}"] },
    });
    expect(project.test?.exclude).toContain("**/*.browser.test.*");
    expect(project.test?.setupFiles).toEqual([expect.stringMatching(/testing\/src\/matchers\.ts$/)]);
  });

  test('"browser" runs *.browser.test.* in Chromium with the setup, reduced motion and one React', () => {
    const project = webAgentsProject("browser");
    expect(project.test).toMatchObject({
      name: "browser",
      include: ["**/*.browser.test.{ts,tsx}"],
      provide: { webAgentsMotion: "reduced" },
      browser: { enabled: true, headless: true, instances: [{ browser: "chromium" }], viewport: { width: 414, height: 800 } },
    });
    expect(project.test?.setupFiles).toEqual([expect.stringMatching(/testing\/src\/setup\.ts$/)]);
    expect(project.optimizeDeps?.include).toEqual(expect.arrayContaining(["react", "react-dom", "react-dom/client"]));
  });

  test("a page without WebMCP: only the matchers", () => {
    const project = webAgentsProject("browser", { setupFiles: ["@webmcp-agents/testing/matchers"], motion: "full" });
    expect(project.test?.setupFiles).toEqual([expect.stringMatching(/matchers\.ts$/)]);
    expect(project.test?.provide).toEqual({ webAgentsMotion: "full" });
  });

  test("overrides: name, include, define, extra test options", () => {
    const project = webAgentsProject("browser", {
      name: "core:browser",
      include: ["src/**/*.browser.test.ts"],
      define: { "process.env.NODE_ENV": '"production"' },
      test: { testTimeout: 10_000 },
    });
    expect(project).toMatchObject({
      define: { "process.env.NODE_ENV": '"production"' },
      test: { name: "core:browser", testTimeout: 10_000 },
    });
  });

  test("a wrong kind fails with a sentence", () => {
    expect(() => webAgentsProject("node" as never)).toThrow('webAgentsProject takes "unit" or "browser", got "node".');
  });
});
