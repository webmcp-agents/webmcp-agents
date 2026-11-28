/**
 * What the browser entry may hold (R-EXP-4 "no secret in the page"; design decision 3): no server env read, no header
 * value, no vendor name. Checked on the source of every module the browser entry and its chunks are built from.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const src = join(import.meta.dirname, "../src");
const browser = [
  "index.ts",
  "react.tsx",
  "semconv.ts",
  ...readdirSync(join(src, "browser")).map((f) => `browser/${f}`),
  "shared/util.ts",
  "shared/types.ts",
];
const code = (file: string) =>
  readFileSync(join(src, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("the browser entry", () => {
  test.each(browser)("%s reads no server env and imports nothing server-side", (file) => {
    const text = code(file);
    expect(text).not.toMatch(/process\.env|OTEL_EXPORTER|import\.meta\.env/);
    expect(text).not.toMatch(/from "(\.\.\/server|@webmcp-agents\/chat\/server|node:)/);
  });

  test("no vendor name anywhere in the package's code (design decision 3)", () => {
    const all = [...browser, ...readdirSync(join(src, "server")).map((f) => `server/${f}`)].map(code).join("\n");
    expect(all).not.toMatch(/langsmith|langwatch|langfuse|sentry|instana|datadog|honeycomb|braintrust|posthog|vercel\/otel/i);
  });
});

describe("the instrumentation scope's version", () => {
  test("is the package's version (a release that bumps one must bump the other)", async () => {
    const { VERSION } = await import("../src/shared/util");
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
