/**
 * Bundle-size budget for @webmcp-agents/core, min+gz, measured as a consumer's
 * bundler would see it: each check re-exports some names from src/index.ts,
 * so tree-shaking keeps only what that import pulls in.
 *
 *   pnpm --filter @webmcp-agents/core size
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const KB = 1024;
const index = fileURLToPath(new URL("../src/index.ts", import.meta.url));

/**
 * Budgets: see "Quality bar" in .agents/plans/00-web-agents-roadmap.md.
 *
 * Phase 14 (.agents/plans/14-imperative-tools.md): the visuals needed no raise (9.21 KB with the field step for
 * tools). The whole package measures 15.76 KB with the locator, `createWebAgents`, URL tracking, flags and `invoke`;
 * its budget was raised from 13 KB to 16 KB (decided 2026-11-09, above the 14.25 KB the plan first estimated), then
 * to 16.25 KB for two additions: `inspectTools` for the devtools (15.99 KB) and deferring URL notices out of React's
 * insertion effects, a Next.js fix (16.02 KB).
 *
 * The provider loads the polyfill itself (decided 2026-11-10): `loadWebMCPPolyfill`, `whenModelContext`, the queue
 * that keeps a registration made before `document.modelContext` exists, and createWebAgents' `polyfill` option add
 * about 280 B (16.29 KB), so the whole-package budget went from 16.25 KB to 16.5 KB. The polyfill itself (about
 * 2.5 KB) is a chunk reached only by dynamic import: it is reported, not counted, since browsers with WebMCP never
 * download it.
 *
 * Cursor reliability (2026-11-10): a press that waits for its control to scroll into view, pinned (sticky / fixed)
 * controls, leaving a control that is no longer under the hand, a parked confirmation that follows its control,
 * a background tab and a frame-less pane add about 0.7 KB to both: 9.96 KB and 17.2 KB. Budgets raised to 10 KB and
 * 17.25 KB. The confirm gate's 10 s limit and a person's own call cancelling a waiting confirmation add about 0.2 KB
 * outside the visuals (17.41 KB): the whole-package budget went to 17.5 KB. The person clicking elsewhere or
 * scrolling cancelling a waiting confirmation (2026-11-11) adds about 0.3 KB (17.71 KB): budget 17.75 KB. An async
 * `target` (2026-11-13: open the ⌘K palette or drawer a control lives in, then type there) adds about 0.1 KB
 * (17.82 KB): budget 17.85 KB.
 *
 * The cursor in step (2026-11-13): one hand for calls that overlap (a move says whether it arrived; a run that lost
 * the hand plays unseen), the press landing on the frame that draws it, waits that end on a yield, a ring that keeps
 * its frames, a reveal by landing point, masked passwords, spoken tool titles and a name read without hidden parts
 * add about 0.42 KB to the visuals (10.38 KB) and 0.45 KB to the whole package (18.27 KB). Budgets raised to
 * 10.4 KB and 18.3 KB. Presses that overlap each landing on their frame, and an async target remembered per call
 * (never opened outside a call's start, a rejection counting as none) add about 0.1 KB (10.41 KB and 18.39 KB):
 * budgets 10.45 KB and 18.4 KB.
 */
const CHECKS = [
  { name: "visuals (installAgentVisuals, onAgentEvent)", exports: "{ installAgentVisuals, onAgentEvent }", budget: 10.45 * KB },
  { name: "whole package", exports: "*", budget: 18.4 * KB },
];

async function size(exports) {
  // A real file (not a virtual module): Vite's lib mode resolves the entry from disk.
  const dir = await mkdtemp(join(tmpdir(), "web-agents-size-"));
  const entry = join(dir, "entry.js");
  await writeFile(entry, `export ${exports} from ${JSON.stringify(index)};`);
  try {
    const out = await build({
      configFile: false,
      logLevel: "silent",
      build: { write: false, minify: true, lib: { entry, formats: ["es"], fileName: "out" } },
    });
    const chunks = (Array.isArray(out) ? out[0] : out).output.filter((o) => o.type === "chunk");
    const gz = (chunk) => gzipSync(chunk.code, { level: 9 }).length;
    // What a page downloads up front: the entry and what it imports statically. A chunk reached only by a dynamic
    // import (the polyfill, which `loadWebMCPPolyfill` loads where the browser has no WebMCP) is reported apart.
    const main = chunks.find((c) => c.isEntry);
    const upFront = new Set([main.fileName, ...main.imports]);
    return {
      bytes: chunks.filter((c) => upFront.has(c.fileName)).reduce((sum, c) => sum + gz(c), 0),
      lazy: chunks.filter((c) => !upFront.has(c.fileName)).map((c) => ({ name: c.name, bytes: gz(c) })),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let failed = false;
for (const check of CHECKS) {
  const { bytes, lazy } = await size(check.exports);
  const ok = bytes <= check.budget;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${check.name}: ${(bytes / KB).toFixed(2)} KB min+gz, ${bytes} B (budget ${check.budget / KB} KB)`);
  for (const chunk of lazy) console.log(`     + loaded on demand, not counted: ${chunk.name} ${(chunk.bytes / KB).toFixed(2)} KB min+gz`);
}
if (failed) process.exit(1);
