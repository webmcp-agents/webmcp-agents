/**
 * `@webmcp-agents/testing/vitest`: the two Vitest projects a WebMCP app needs, so a config is two lines.
 *
 *   export default defineConfig({ test: { projects: [webAgentsProject("unit"), webAgentsProject("browser")] } });
 *
 * Node only (it runs in your Vitest config). It imports nothing of the kit by relative path, so the repo's own
 * configs can load it from source (`../testing/src/vitest.ts`).
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProjectInlineConfiguration } from "vitest/config";

/** How the browser setup treats motion: `"reduced"` (default) snaps the cursor; `"full"` keeps the page's own setting. */
export type MotionSetting = "reduced" | "full";

declare module "vitest" {
  interface ProvidedContext {
    /** Set by `webAgentsProject("browser", { motion })`, read by `./setup`. */
    webAgentsMotion: MotionSetting;
  }
}

/** Which project: `"unit"` runs `*.test.*` in Node, `"browser"` runs `*.browser.test.*` in Chromium. */
export type WebAgentsProjectKind = "unit" | "browser";

/** What can be changed on a project. Anything not listed goes in `test` (merged last) or at the top level. */
export interface WebAgentsProjectOptions {
  /** The project's name (`--project <name>`). Default `"unit"` / `"browser"`. */
  name?: string;
  /** Test files. Default `**\/*.test.{ts,tsx}` (unit, minus browser tests) / `**\/*.browser.test.{ts,tsx}`. */
  include?: string[];
  /** Files to leave out, added to the defaults. */
  exclude?: string[];
  /**
   * Setup files. Default `["@webmcp-agents/testing/matchers"]` (unit) / `["@webmcp-agents/testing/setup"]` (browser).
   * A page that must stay without `document.modelContext` uses `["@webmcp-agents/testing/matchers"]`.
   */
  setupFiles?: string[];
  /** Browser only: `"reduced"` (default) makes the cursor snap; `"full"` keeps the motion, for tests of the motion. */
  motion?: MotionSetting;
  /** Browser only: the viewport. Default 414 × 800 (keep test targets inside it). */
  viewport?: { width: number; height: number };
  /** Compile-time constants, e.g. `{ "process.env.NODE_ENV": JSON.stringify("production") }`. */
  define?: Record<string, string>;
  /** Dependencies to pre-bundle, added to React's (a dependency found mid-run reloads Vite and the test). */
  optimizeDeps?: { include?: string[] };
  /** Any other Vitest `test` option, merged over the project's. */
  test?: Record<string, unknown>;
}

const SPECIFIERS: Record<string, string> = {
  "@webmcp-agents/testing/setup": "setup",
  "@webmcp-agents/testing/matchers": "matchers",
};

/**
 * The kit's own setup files by absolute path, next to this module: `./setup.js` in the package's `dist`, `./setup.ts`
 * in its source. Vite then loads them like any test file (the app's resolve conditions apply).
 */
const ownFile = (specifier: string): string => {
  const name = SPECIFIERS[specifier];
  if (!name) return specifier;
  const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  return fileURLToPath(new URL(`./${name}${ext}`, import.meta.url));
};

const require = createRequire(import.meta.url);

/** `playwright()` from `@vitest/browser-playwright`, or a sentence naming the package. */
function playwrightProvider(): unknown {
  let module: { playwright(options?: unknown): unknown };
  try {
    module = require("@vitest/browser-playwright");
  } catch (err) {
    // the sentence of ./peer's missingPeerMessage, inlined: a config loads this file with no relative imports
    throw new Error(
      'webAgentsProject("browser") needs @vitest/browser-playwright, which is not installed: add it to your devDependencies (pnpm add -D @vitest/browser-playwright).',
      { cause: err },
    );
  }
  return module.playwright();
}

/** Resolvable from the project being tested. */
const installed = (specifier: string): boolean => {
  try {
    // from the project's own folder: `require.resolve(…, { paths })` would also find the kit's own copies
    createRequire(join(process.cwd(), "vitest.config.js")).resolve(specifier);
    return true;
  } catch {
    return false;
  }
};

/**
 * Pre-bundled up front when the app has them: a dependency discovered mid-run reloads Vite and the test with it.
 * React (one copy), and `ai/test`, which `mockChatServer` loads on its first request.
 */
function knownDeps(): string[] {
  return [
    ...(installed("react") ? ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client"] : []),
    ...(installed("ai") ? ["ai/test"] : []),
  ];
}

/**
 * One Vitest project with the kit's defaults. `extends: true`, so the root config's plugins, `resolve` and `define`
 * apply to it too.
 *
 * - `"unit"`: Node; `**\/*.test.{ts,tsx}` minus browser tests; setup `@webmcp-agents/testing/matchers`.
 * - `"browser"`: Chromium through Playwright, headless, viewport 414 × 800; `**\/*.browser.test.{ts,tsx}`; setup
 *   `@webmcp-agents/testing/setup` (polyfill, reduced motion, deterministic ids, cleanup and leak checks); React
 *   pre-bundled once.
 *
 * @example
 * export default defineConfig({ test: { projects: [webAgentsProject("unit"), webAgentsProject("browser")] } });
 * @example
 * // a page without WebMCP: only the matchers
 * webAgentsProject("browser", { name: "no-webmcp", include: ["src/no-webmcp.browser.test.ts"], setupFiles: ["@webmcp-agents/testing/matchers"] })
 */
export function webAgentsProject(kind: WebAgentsProjectKind, options: WebAgentsProjectOptions = {}): TestProjectInlineConfiguration {
  if (kind !== "unit" && kind !== "browser") {
    throw new TypeError(`webAgentsProject takes "unit" or "browser", got ${JSON.stringify(kind)}.`);
  }
  const { name = kind, define, optimizeDeps, test: extra = {} } = options;
  if (kind === "unit") {
    return {
      extends: true,
      ...(define ? { define } : {}),
      test: {
        name,
        environment: "node",
        include: options.include ?? ["**/*.test.{ts,tsx}"],
        exclude: ["**/node_modules/**", "**/dist/**", "**/*.browser.test.*", ...(options.exclude ?? [])],
        setupFiles: (options.setupFiles ?? ["@webmcp-agents/testing/matchers"]).map(ownFile),
        ...extra,
      },
    } as TestProjectInlineConfiguration;
  }
  return {
    extends: true,
    ...(define ? { define } : {}),
    optimizeDeps: {
      include: [...knownDeps(), ...(optimizeDeps?.include ?? [])],
      // served as plain ESM: its entries use a top-level await the pre-bundler may not accept
      exclude: ["@webmcp-agents/testing"],
    },
    test: {
      name,
      include: options.include ?? ["**/*.browser.test.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/dist/**", ...(options.exclude ?? [])],
      setupFiles: (options.setupFiles ?? ["@webmcp-agents/testing/setup"]).map(ownFile),
      provide: { webAgentsMotion: options.motion ?? "reduced" },
      browser: {
        enabled: true,
        headless: true,
        provider: playwrightProvider(),
        instances: [{ browser: "chromium" }],
        viewport: options.viewport ?? { width: 414, height: 800 },
      },
      ...extra,
    },
  } as TestProjectInlineConfiguration;
}
