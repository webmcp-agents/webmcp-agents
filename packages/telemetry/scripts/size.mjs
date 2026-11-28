/**
 * Bundle-size budget for @webmcp-agents/telemetry's browser entry, min+gz, as a consumer's bundler sees it.
 *
 *   pnpm --filter @webmcp-agents/telemetry size
 *
 * What is counted: this package's own code on the default path, `observeAgents()` sending to the relay (design §7.5:
 * ≤ 3 KB). `@webmcp-agents/chat` and `@webmcp-agents/core` are left out (external): a page that runs agents already
 * ships them, and `observeAgents` only subscribes to what they emit. The bridge to a page's own OpenTelemetry provider
 * is a chunk reached by dynamic import, loaded only when the page registered one: reported, not counted, and
 * `@opentelemetry/api` itself is the page's.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const KB = 1024;
const index = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const external = (id) => /^@webmcp-agents\//.test(id) || /^@opentelemetry\//.test(id);

const CHECKS = [
  { name: "observeAgents (relay path)", exports: "{ observeAgents }", budget: 3 * KB },
  // the app's own events and spans add a forwarding stub up front; building them is the engine chunk's
  {
    name: "observeAgents + recordAgentEvent + withAgentSpan",
    exports: "{ observeAgents, recordAgentEvent, withAgentSpan }",
    budget: 3 * KB,
  },
];

async function size(exports) {
  const dir = await mkdtemp(join(tmpdir(), "web-agents-telemetry-size-"));
  const entry = join(dir, "entry.js");
  await writeFile(entry, `export ${exports} from ${JSON.stringify(index)};`);
  try {
    const out = await build({
      configFile: false,
      logLevel: "silent",
      build: { write: false, minify: true, lib: { entry, formats: ["es"], fileName: "out" }, rollupOptions: { external } },
    });
    const chunks = (Array.isArray(out) ? out[0] : out).output.filter((o) => o.type === "chunk");
    const gz = (chunk) => gzipSync(chunk.code, { level: 9 }).length;
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
