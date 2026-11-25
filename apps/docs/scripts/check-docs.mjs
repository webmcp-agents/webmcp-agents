#!/usr/bin/env node
/**
 * The docs check: what `blume validate` cannot know about this site's conventions (docs/README.md, "How these docs
 * are written"). Run by the docs app's `test` script, so it is part of `pnpm check`.
 *
 *   1. A page written in <View> blocks has exactly the four framework views, in order.
 *   2. An installation page has the six step headings, in order, and its "Next" link carries its framework; neither it
 *      nor a file it includes mentions shadcn/ui or imports `@/components/ui/*` (installation is the framework only). A Build
 *      page has its parts: "A complete example" in views first, then "Try it", "Options you'll use most", and no "Next"
 *      card (Blume's pager links the next page; only the path's last page, which has none, ends with "## Next").
 *   3. A reference page on the template has the template's sections, in order (an allow-list names the pages not
 *      migrated yet; step C of the docs plan empties it).
 *   4. On a migrated page, a code block that shows a file carries its name, and a long one is an <include> of a
 *      compiled file under docs/_examples (an allow-list names guide pages not migrated yet; empty since step D).
 *   5. Retired teaching (toolname on a control, the provider's earlier props, ctx.context, agent.run, raw
 *      annotations) appears only where it is documented as the earlier form.
 *   6. Every property of an exported option type (read with the TypeScript compiler from packages/*\/src) has a row
 *      in its reference page's Options or Props table, for the pages on the template.
 *   7. docs/_examples: lines fit the page (72 columns), and a Next.js copy of a shared component is the shared file
 *      with `"use client"` on top.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const docs = join(repo, "docs");
const examples = join(docs, "_examples");

// ---------- the conventions ----------

/** The view titles, in order: a saved choice only applies to a page whose views are titled exactly like this. */
const FRAMEWORKS = ["Vite", "Next.js", "TanStack Start", "Astro"];

/** The installation pages: route slug → the view title their "Next" link carries. */
const INSTALLATION = { vite: "Vite", nextjs: "Next.js", "tanstack-start": "TanStack Start", astro: "Astro" };
const INSTALL_STEPS = ["Create a project", "Install the packages", "Add the styles", "Add the provider", "Add your first tool", "Run it"];

/** The reference template: H2 sections in this order. Options for functions and hooks, Props for components, Input and Answer for the ready-made tools. */
const REFERENCE_SECTIONS = ["Import", "Example", "Options", "Props", "Input", "Answer", "Returns", "Notes", "See also"];
const REFERENCE_REQUIRED = ["Import", "Example", "See also"];
const REFERENCE_TABLE = ["Options", "Props", "Input"];

/** Reference pages not yet on the template. Empty since step C of .agents/plans/15-docs-framework-first.md: add a page here only while migrating a new one. */
const REFERENCE_NOT_MIGRATED = new Set([]);

/** Guide pages not yet rewritten in the new pattern. Empty since step D of .agents/plans/15-docs-framework-first.md: add a page here only while migrating a new one. */
const GUIDES_NOT_MIGRATED = new Set([]);

/** An inline fence in one of these languages with more lines than this must be an <include> of a compiled file. */
const CODE_LANGUAGES = new Set(["ts", "tsx", "js", "jsx", "mjs"]);
const EXCERPT_MAX_LINES = 12;
/** A fence in one of these languages that has an export or a directive, or is long, shows a file and needs its name (an import-only block is the Import section). */
const FILE_LANGUAGES = new Set([...CODE_LANGUAGES, "astro", "json", "css", "html"]);

/** The retired teaching, and where it may still appear (as the earlier form it is). */
const RETIRED = [
  { pattern: /toolname=/, what: "`toolname` on a control", allow: (line) => /<form[\s>]|form\[|\bform\b/i.test(line) },
  { pattern: /\bpathname=/, what: "the provider's `pathname` prop" },
  { pattern: /\bglobal=/, what: "the provider's `global` prop" },
  { pattern: /\broutes=/, what: "the provider's `routes` prop" },
  { pattern: /\bcontext=\{/, what: "the provider's `context` prop" },
  { pattern: /ctx\.context/, what: "`ctx.context`", allow: (line) => /^\|\s*`context`/.test(line) },
  { pattern: /agent\.run\(/, what: "`agent.run(`" },
  { pattern: /annotations:\s*\{/, what: "raw `annotations`" },
];
const RETIRED_ALLOWED_PAGES = new Set([
  "more/declarative-forms.mdx",
  "more/polyfill.mdx",
  "reference/react/jsx-attributes.md",
  "reference/react/use-tool-answer.md",
  "reference/react/use-enable-tools.md",
  "reference/react/use-enabled-tools.md",
  "reference/chat/call-model-context-tool.md",
  "reference/polyfill/polyfill-model-context.md",
]);
/** A line that names the earlier form itself ("declarative", "earlier", "legacy") is about it, not teaching it. */
const RETIRED_SELF_DESCRIBING = /declarative|earlier|legacy|deprecated/i;

/**
 * Exported option types and the reference page whose Options or Props table must list every property. Checked for
 * the pages on the template; step C adds a row here for every page it migrates.
 */
const OPTION_TYPES = [
  { type: "WebToolConfig", file: "packages/core/src/web-tool.ts", page: "reference/core/define-web-tool.md" },
  { type: "ToModelContextToolOptions", file: "packages/core/src/web-tool.ts", page: "reference/core/to-model-context-tool.md" },
  { type: "RedactOptions", file: "packages/core/src/redact/redactor.ts", page: "reference/core/create-redactor.md" },
  { type: "ToolCallView", file: "packages/chat/src/redact.ts", page: "reference/chat/redact-tool-call.md" },
  { type: "WebAgentsOptions", file: "packages/core/src/web-agents.ts", page: "reference/core/create-web-agents.md" },
  { type: "AgentVisualsOptions", file: "packages/core/src/visuals.ts", page: "reference/core/install-agent-visuals.md" },
  { type: "ToolLocator", file: "packages/core/src/locate.ts", page: "reference/core/locate.md" },
  { type: "UseWebToolOptions", file: "packages/react/src/use-web-tool.ts", page: "reference/react/use-web-tool.md" },
  { type: "WebAgentsProviderProps", file: "packages/react/src/provider.tsx", page: "reference/react/web-agents-provider.md" },
  { type: "WebAgentConfig", file: "packages/chat/src/agent.ts", page: "reference/chat/define-web-agent.md" },
  { type: "WebAgentInvokeOptions", file: "packages/chat/src/agent.ts", page: "reference/chat/define-web-agent.md" },
  { type: "AgentChatProps", file: "packages/chat/src/components/AgentChat.tsx", page: "reference/chat/agent-chat.md" },
  { type: "CloudAdapterOptions", file: "packages/chat/src/adapter/cloud.ts", page: "reference/chat/create-cloud-adapter.md" },
  { type: "UseWebAgentOptions", file: "packages/chat/src/session/use-web-agent.ts", page: "reference/chat/use-web-agent.md" },
  { type: "LocalAdapterOptions", file: "packages/local-agent/src/index.ts", page: "reference/local-agent/create-local-adapter.md" },
  { type: "WebAgentsDevtoolsProps", file: "packages/devtools/src/react.tsx", page: "reference/devtools/web-agents-devtools.md" },
  { type: "GetTimeOptions", file: "packages/tools/src/get-time.ts", page: "reference/tools/get-time.md" },
  { type: "GetLocationOptions", file: "packages/tools/src/get-location.ts", page: "reference/tools/get-location.md" },
  { type: "GetPageOptions", file: "packages/tools/src/get-page.ts", page: "reference/tools/get-page.md" },
  { type: "GoToOptions", file: "packages/tools/src/go-to.ts", page: "reference/tools/go-to.md" },
  { type: "GoBackOptions", file: "packages/tools/src/go-back.ts", page: "reference/tools/go-back.md" },
  { type: "ScrollToOptions", file: "packages/tools/src/scroll-to.ts", page: "reference/tools/scroll-to.md" },
  { type: "SetThemeOptions", file: "packages/tools/src/set-theme.ts", page: "reference/tools/set-theme.md" },
  { type: "ToolRegistryOptions", file: "packages/core/src/registry.ts", page: "reference/core/create-tool-registry.md" },
  { type: "DeferReleaseOptions", file: "packages/core/src/deferred.ts", page: "reference/core/defer-release.md" },
  { type: "ExecuteToolOptions", file: "packages/core/src/execute.ts", page: "reference/core/execute-tool.md" },
  { type: "SpotlightOptions", file: "packages/core/src/cursor.ts", page: "reference/core/install-agent-visuals.md" },
  { type: "YieldOptions", file: "packages/core/src/user-yield.ts", page: "reference/core/install-agent-visuals.md" },
  { type: "DevtoolsOptions", file: "packages/devtools/src/host.ts", page: "reference/devtools/install-web-agents-devtools.md" },
  { type: "DevtoolsStoreOptions", file: "packages/devtools/src/store.ts", page: "reference/devtools/create-devtools-store.md" },
  { type: "SchemaFormProps", file: "packages/devtools/src/schema-form/schema-form.tsx", page: "reference/devtools/schema-form.md" },
  { type: "SchemaNode", file: "packages/devtools/src/schema.ts", page: "reference/devtools/parse-schema.md" },
  { type: "AgentConsoleOptions", file: "packages/devtools/src/index.ts", page: "reference/devtools/install-agent-console.md" },
  { type: "CallToolOptions", file: "packages/chat/src/tools.ts", page: "reference/chat/call-model-context-tool.md" },
  { type: "ChatHandlerOptions", file: "packages/chat/src/server/handler.ts", page: "reference/chat/create-chat-handler.md" },
  { type: "WebAgentsChatDevOptions", file: "packages/chat/src/vite/index.ts", page: "reference/chat/web-agents-chat-dev.md" },
  { type: "ToToolLoopAgentOptions", file: "packages/chat/src/server/web-agent.ts", page: "reference/chat/to-tool-loop-agent.md" },
  { type: "UseAgentChatOptions", file: "packages/chat/src/session/use-agent-chat.ts", page: "reference/chat/use-agent-chat.md" },
  { type: "ChatCustomization", file: "packages/chat/src/customize/types.ts", page: "reference/chat/agent-chat.md" },
  { type: "ChatTheme", file: "packages/chat/src/customize/types.ts", page: "reference/chat/chat-theme.md" },
  { type: "ChatComponents", file: "packages/chat/src/customize/types.ts", page: "reference/chat/chat-components.md" },
  { type: "RenderChatOptions", file: "packages/testing/src/chat/render-chat.ts", page: "reference/testing/render-chat.md" },
  {
    type: "NoHardcodedTextOptions",
    file: "packages/testing/src/matchers/to-have-no-hardcoded-text.ts",
    page: "reference/testing/to-have-no-hardcoded-text.md",
  },
  { type: "UseAgentSessionOptions", file: "packages/chat/src/session/use-agent-session.ts", page: "reference/chat/use-agent-session.md" },
  { type: "AgentAdapter", file: "packages/chat/src/types.ts", page: "reference/chat/adapter-types.md" },
  { type: "ModelChoice", file: "packages/chat/src/types.ts", page: "reference/chat/adapter-types.md" },
  { type: "AgentRunRequest", file: "packages/chat/src/types.ts", page: "reference/chat/adapter-types.md" },
  { type: "OnAgentRunOptions", file: "packages/chat/src/session/run-events.ts", page: "reference/chat/on-agent-run.md" },
  { type: "RunRef", file: "packages/chat/src/session/run-events.ts", page: "reference/chat/on-agent-run.md" },
  { type: "ChatTelemetryOptions", file: "packages/chat/src/server/telemetry.ts", page: "reference/chat/create-chat-handler.md" },
  { type: "ChatObservability", file: "packages/chat/src/server/telemetry.ts", page: "reference/chat/create-chat-handler.md" },
  { type: "RunLog", file: "packages/testing/src/run-record.ts", page: "reference/testing/runs.md" },
  { type: "MockAdapterOptions", file: "packages/testing/src/chat/mock-adapter.ts", page: "reference/testing/mock-adapter.md" },
  { type: "ToolDescriptor", file: "packages/chat/src/types.ts", page: "reference/chat/adapter-types.md" },
  { type: "GoToInput", file: "packages/tools/src/go-to.ts", page: "reference/tools/go-to.md" },
  { type: "ScrollToInput", file: "packages/tools/src/scroll-to.ts", page: "reference/tools/scroll-to.md" },
  { type: "SetThemeInput", file: "packages/tools/src/set-theme.ts", page: "reference/tools/set-theme.md" },
  { type: "WeekInfo", file: "packages/tools/src/calendar.ts", page: "reference/tools/calendar.md" },
  { type: "WebAgentsProjectOptions", file: "packages/testing/src/vitest.ts", page: "reference/testing/web-agents-project.md" },
  { type: "ToolsFixture", file: "packages/testing/src/test.ts", page: "reference/testing/tools.md" },
  { type: "EventLog", file: "packages/testing/src/helpers/events.ts", page: "reference/testing/events.md" },
  { type: "FakeUser", file: "packages/testing/src/fake-user.ts", page: "reference/testing/user.md" },
  { type: "CallToolOptions", file: "packages/testing/src/helpers/tools.ts", page: "reference/testing/call-tool.md" },
  { type: "MockToolDefinition", file: "packages/testing/src/helpers/tools.ts", page: "reference/testing/mock-tool.md" },
  { type: "ToolFormOptions", file: "packages/testing/src/helpers/forms.ts", page: "reference/testing/helpers.md" },
  { type: "EchoFormOptions", file: "packages/testing/src/helpers/forms.ts", page: "reference/testing/helpers.md" },
  { type: "UntilOptions", file: "packages/testing/src/helpers/wait.ts", page: "reference/testing/helpers.md" },
  { type: "MockAdapterOptions", file: "packages/testing/src/chat/mock-adapter.ts", page: "reference/testing/mock-adapter.md" },
  { type: "MockChatServerOptions", file: "packages/testing/src/chat/mock-chat-server.ts", page: "reference/testing/mock-chat-server.md" },
  { type: "RenderChatOptions", file: "packages/testing/src/chat/render-chat.ts", page: "reference/testing/render-chat.md" },
  { type: "ChatRequestOptions", file: "packages/testing/src/server/request.ts", page: "reference/testing/server-requests.md" },
  { type: "OpenAppOptions", file: "packages/testing/src/playwright/index.ts", page: "reference/testing/playwright.md" },
  {
    type: "TransformersProviderOptions",
    file: "packages/local-agent/src/providers/transformers/provider.ts",
    page: "reference/local-agent/create-transformers-provider.md",
  },
  {
    type: "ModelInfo",
    file: "packages/local-agent/src/providers/transformers/provider.ts",
    page: "reference/local-agent/create-transformers-provider.md",
  },
  { type: "LocalLoopOptions", file: "packages/local-agent/src/loop.ts", page: "reference/local-agent/run-local-agent.md" },
  { type: "LocalProvider", file: "packages/local-agent/src/types.ts", page: "reference/local-agent/provider-types.md" },
  { type: "GenerateRequest", file: "packages/local-agent/src/types.ts", page: "reference/local-agent/provider-types.md" },
  { type: "GenerateResult", file: "packages/local-agent/src/types.ts", page: "reference/local-agent/provider-types.md" },
  { type: "ChatTurn", file: "packages/local-agent/src/types.ts", page: "reference/local-agent/provider-types.md" },
  { type: "CompactTool", file: "packages/local-agent/src/types.ts", page: "reference/local-agent/provider-types.md" },
  { type: "VercelChatRouteOptions", file: "packages/vercel-api/src/index.ts", page: "reference/vercel-api/create-vercel-chat-route.md" },
  { type: "LimiterOptions", file: "packages/vercel-api/src/limiter.ts", page: "reference/vercel-api/limiter.md" },
  { type: "Limiter", file: "packages/vercel-api/src/limiter.ts", page: "reference/vercel-api/limiter.md" },
  { type: "LimitResult", file: "packages/vercel-api/src/limiter.ts", page: "reference/vercel-api/limiter.md" },
];

/** docs/_examples: the widest line a docs code block shows without a sideways scroll on a desktop viewport. */
const EXAMPLE_MAX_COLUMNS = 72;

// ---------- helpers ----------

const problems = [];
const fail = (page, message) => problems.push(`${page}: ${message}`);

/** Every file under `dir` (recursively) whose name passes `keep`, skipping folders that start with `_` or `.` and media. */
function walk(dir, keep, skipUnderscore = true) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules" || entry === "media") continue;
    if (skipUnderscore && entry.startsWith("_")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, keep, skipUnderscore));
    else if (keep(entry)) out.push(path);
  }
  return out;
}

const pages = walk(docs, (name) => /\.mdx?$/.test(name))
  .filter((path) => path !== join(docs, "README.md")) // for GitHub only, excluded from the site
  .map((path) => ({
    path,
    rel: relative(docs, path),
    text: readFileSync(path, "utf8"),
  }));

/** The page's lines with fenced code blocks blanked (so a `## heading` inside a fence is not a heading). */
function proseLines(text) {
  const lines = text.split("\n");
  let fence = null;
  return lines.map((line) => {
    const open = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return "";
    }
    if (open) {
      fence = open[1];
      return "";
    }
    return line;
  });
}

/** `## ` headings in order, with their line numbers. */
const h2s = (text) =>
  proseLines(text)
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => /^## /.test(line))
    .map(({ line, i }) => ({ title: line.slice(3).trim(), line: i + 1 }));

/** Every fenced code block: language, meta string, body lines, line number. */
function fences(text) {
  const out = [];
  const lines = text.split("\n");
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(`{3,}|~{3,})(\S*)\s*(.*)$/);
    if (!open) {
      if (m && m[1].length >= 3 && (m[2] || m[3] !== "")) open = { marker: m[1], lang: m[2], meta: m[3].trim(), start: i + 1, body: [] };
      else if (m && m[1].length >= 3) open = { marker: m[1], lang: "", meta: "", start: i + 1, body: [] };
      continue;
    }
    if (m && m[1][0] === open.marker[0] && m[1].length >= open.marker.length && m[2] === "" && m[3] === "") {
      out.push(open);
      open = null;
    } else open.body.push(lines[i]);
  }
  return out;
}

/** `<include …>target</include>` statements, with their meta. */
const includes = (text) =>
  [...text.matchAll(/<include([^>]*)>\s*([^<\s]+)\s*<\/include>/g)].map((m) => ({
    attrs: m[1],
    target: m[2],
    meta:
      m[1]
        .match(/meta=(?:'([^']*)'|"([^"]*)")/)
        ?.slice(1)
        .find(Boolean) ?? "",
  }));

const hasTitle = (meta) =>
  /title=/.test(meta) || /^[^{\s"'=]+\.[a-z0-9]+(\s|$)/.test(meta) || /^[\w./-]+\.[a-z0-9]+\b/.test(meta.split(/\s+/)[0] ?? "");

// ---------- 1. views ----------

for (const page of pages) {
  const titles = [...page.text.matchAll(/<View\s+title="([^"]+)"/g)].map((m) => m[1]);
  if (titles.length === 0) continue;
  const distinct = [...new Set(titles)];
  if (distinct.join("|") !== FRAMEWORKS.join("|"))
    fail(page.rel, `views are [${distinct.join(", ")}]; every page with views has exactly [${FRAMEWORKS.join(", ")}], in that order`);
  // Each group of four is one block of the page: the titles cycle through the four, in order.
  for (let i = 0; i < titles.length; i++) {
    if (titles[i] !== FRAMEWORKS[i % FRAMEWORKS.length]) {
      fail(page.rel, `view #${i + 1} is "${titles[i]}"; each block of views runs ${FRAMEWORKS.join(", ")}`);
      break;
    }
  }
}

// ---------- 2. installation pages ----------

for (const [slug, framework] of Object.entries(INSTALLATION)) {
  const page = pages.find((p) => p.rel === `(get-started)/installation/${slug}.mdx`);
  if (!page) {
    fail(`(get-started)/installation/${slug}.mdx`, "missing");
    continue;
  }
  const steps = h2s(page.text)
    .map((h) => h.title)
    .filter((t) => t !== "Next");
  if (steps.join("|") !== INSTALL_STEPS.join("|"))
    fail(page.rel, `steps are [${steps.join(", ")}]; every installation page has [${INSTALL_STEPS.join(", ")}]`);
  const next = page.text.match(/href="\/build\/define-a-tool\?view=([^"]+)"/);
  if (!next) fail(page.rel, 'the "Next" card must link /build/define-a-tool?view=<framework>');
  else if (decodeURIComponent(next[1].replace(/\+/g, " ")) !== framework)
    fail(page.rel, `the "Next" link carries view "${next[1]}", expected "${framework}"`);
  if (!page.text.includes(`<RememberFramework name="${framework}" />`)) fail(page.rel, `missing <RememberFramework name="${framework}" />`);
}
// Installation is about the framework only: shadcn/ui is optional, introduced once on Define a tool.
for (const page of pages.filter((p) => p.rel.startsWith("(get-started)/installation/"))) {
  if (/shadcn/i.test(page.text)) fail(page.rel, "an installation page never mentions shadcn/ui (Define a tool introduces it)");
  for (const inc of includes(page.text)) {
    const path = join(docs, inc.target);
    if (!inc.target.startsWith("/_examples/") || !existsSync(path)) continue;
    const code = readFileSync(path, "utf8");
    if (/shadcn|@\/components\/ui\//.test(code))
      fail(page.rel, `<include> of ${inc.target}: an installation example uses plain elements, not shadcn/ui`);
  }
}
{
  const page = pages.find((p) => p.rel === "(get-started)/installation/no-framework.mdx");
  if (page) {
    const steps = h2s(page.text)
      .map((h) => h.title)
      .filter((t) => t !== "Next");
    if (steps.join("|") !== INSTALL_STEPS.join("|"))
      fail(page.rel, `steps are [${steps.join(", ")}]; every installation page has [${INSTALL_STEPS.join(", ")}]`);
  } else fail("(get-started)/installation/no-framework.mdx", "missing");
}

// ---------- 2b. Build pages ----------

/** A Build page's five parts: the definition (prose before the first heading), then these H2s around its own sections. */
const BUILD_FIRST = "A complete example";
const BUILD_LAST = ["Try it", "Options you'll use most"];
/** The path's last page: its pager leaves the path, so it ends with "## Next" and the places to go from here. */
const BUILD_END = "build/devtools.mdx";

for (const page of pages.filter((p) => p.rel.startsWith("build/") && !GUIDES_NOT_MIGRATED.has(p.rel))) {
  const all = h2s(page.text).map((h) => h.title);
  const last = page.rel === BUILD_END;
  if (last && all.at(-1) !== "Next") fail(page.rel, 'the last page of the path ends with "## Next": where to go from here');
  if (!last && all.includes("Next"))
    fail(page.rel, 'no "## Next" on a Build page: Blume\'s Previous / Next pager already links the next page of the path');
  const sections = last ? all.slice(0, -1) : all;
  if (sections[0] !== BUILD_FIRST) fail(page.rel, `a Build page starts with "## ${BUILD_FIRST}"; it starts with "## ${sections[0]}"`);
  if (sections.slice(-BUILD_LAST.length).join("|") !== BUILD_LAST.join("|"))
    fail(
      page.rel,
      `a Build page ends with ${BUILD_LAST.map((t) => `"## ${t}"`).join(", ")}; it ends with ${sections.slice(-3).join(", ")}`,
    );
  if (!/<View\s+title=/.test(page.text)) fail(page.rel, "a Build page shows its complete example in the four framework views");
}

// ---------- 3. reference template ----------

const referencePages = pages.filter((p) => p.rel.startsWith("reference/"));
for (const page of referencePages) {
  if (REFERENCE_NOT_MIGRATED.has(page.rel)) {
    continue;
  }
  // A README is a package's index (a table of its APIs), not an API page.
  if (/(^|\/)README\.md$/.test(page.rel)) continue;
  const sections = h2s(page.text).map((h) => h.title);
  const unknown = sections.filter((s) => !REFERENCE_SECTIONS.includes(s));
  if (unknown.length) fail(page.rel, `sections not in the template: ${unknown.join(", ")}`);
  const order = sections.map((s) => REFERENCE_SECTIONS.indexOf(s)).filter((i) => i >= 0);
  if (order.some((v, i) => i > 0 && v <= order[i - 1]))
    fail(page.rel, `sections out of order: ${sections.join(" > ")}; the template is ${REFERENCE_SECTIONS.join(" > ")}`);
  for (const required of REFERENCE_REQUIRED) if (!sections.includes(required)) fail(page.rel, `missing "## ${required}"`);
  if (!sections.some((s) => REFERENCE_TABLE.includes(s))) fail(page.rel, `missing an Options, Props or Input section`);
  if (!/^# /m.test(page.text)) fail(page.rel, "missing the # title");
}
for (const rel of REFERENCE_NOT_MIGRATED)
  if (!pages.some((p) => p.rel === rel)) fail(rel, "in REFERENCE_NOT_MIGRATED but not a page: remove it from the list");
for (const rel of GUIDES_NOT_MIGRATED)
  if (!pages.some((p) => p.rel === rel)) fail(rel, "in GUIDES_NOT_MIGRATED but not a page: remove it from the list");

// ---------- 4. code blocks on migrated pages ----------

for (const page of pages) {
  if (REFERENCE_NOT_MIGRATED.has(page.rel) || GUIDES_NOT_MIGRATED.has(page.rel)) continue;
  for (const fence of fences(page.text)) {
    if (fence.lang === "package-install") continue;
    const isFile =
      FILE_LANGUAGES.has(fence.lang) &&
      (fence.body.some((l) => /^(export |"use client")/.test(l)) || fence.body.length > EXCERPT_MAX_LINES);
    if (isFile && !hasTitle(fence.meta))
      fail(page.rel, `line ${fence.start}: a ${fence.lang} block that shows a file needs its file name after the language`);
    if (CODE_LANGUAGES.has(fence.lang) && fence.body.length > EXCERPT_MAX_LINES)
      fail(
        page.rel,
        `line ${fence.start}: a ${fence.lang} block of ${fence.body.length} lines is a file, not an excerpt: put it in docs/_examples and <include> it`,
      );
  }
  for (const inc of includes(page.text)) {
    if (!inc.target.startsWith("/_examples/") && !inc.target.startsWith("/_partials/"))
      fail(page.rel, `<include> of ${inc.target}: include files from /_examples (code) or /_partials (prose)`);
    if (inc.target.startsWith("/_examples/") && !hasTitle(inc.meta))
      fail(page.rel, `<include> of ${inc.target} needs meta='title="<file name as the reader has it>"'`);
    if (!existsSync(join(docs, inc.target))) fail(page.rel, `<include> target ${inc.target} does not exist`);
  }
}

// ---------- 5. retired teaching ----------

for (const page of pages) {
  if (RETIRED_ALLOWED_PAGES.has(page.rel)) continue;
  const lines = page.text.split("\n");
  let earlierForm = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^#{2,4} (.*)/);
    if (heading) earlierForm = /earlier form|legacy|declarative/i.test(heading[1]);
    if (earlierForm) continue;
    if (RETIRED_SELF_DESCRIBING.test(line)) continue;
    for (const { pattern, what, allow } of RETIRED) {
      if (pattern.test(line) && !allow?.(line))
        fail(
          page.rel,
          `line ${i + 1}: ${what} is the earlier form; teach it only on more/declarative-forms or under an "Earlier form" heading`,
        );
    }
  }
}

// ---------- 6. option types against the reference tables ----------

const tsconfig = ts.readConfigFile(join(repo, "tsconfig.base.json"), ts.sys.readFile);
const base = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, repo).options;

/** The property names of an exported type, inherited ones included. */
function propertiesOf(file, typeName) {
  const program = ts.createProgram([join(repo, file)], { ...base, noEmit: true, skipLibCheck: true });
  const source = program.getSourceFile(join(repo, file));
  const checker = program.getTypeChecker();
  let found;
  source.forEachChild((node) => {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name.text === typeName) found = node;
  });
  if (!found) return null;
  const type = checker.getTypeAtLocation(found.name);
  return checker.getPropertiesOfType(type).map((p) => p.getName());
}

/** The names in the first column of the tables under `## Options`, `## Props` or `## Input`. */
function documentedOptions(text) {
  const lines = proseLines(text);
  const names = new Set();
  let inTable = false;
  for (const line of lines) {
    if (/^## /.test(line)) inTable = REFERENCE_TABLE.includes(line.slice(3).trim());
    if (!inTable) continue;
    const cell = line.match(/^\|\s*`([^`]+)`/);
    if (cell)
      names.add(
        cell[1]
          .replace(/^options?\./, "")
          .replace(/[?()]/g, "")
          .split(/[\s(]/)[0],
      );
  }
  return names;
}

for (const { type, file, page: rel } of OPTION_TYPES) {
  if (REFERENCE_NOT_MIGRATED.has(rel)) continue;
  const page = pages.find((p) => p.rel === rel);
  if (!page) {
    fail(rel, `OPTION_TYPES names it for ${type} but it is not a page`);
    continue;
  }
  const props = propertiesOf(file, type);
  if (!props) {
    fail(rel, `${type} is not exported from ${file}: fix OPTION_TYPES in check-docs.mjs`);
    continue;
  }
  const documented = documentedOptions(page.text);
  for (const prop of props) if (!documented.has(prop)) fail(rel, `${type}.${prop} has no row in the Options/Props table`);
}

// ---------- 7. the examples ----------

const exampleFiles = walk(examples, (name) => /\.(tsx?|mjs)$/.test(name), false);
for (const path of exampleFiles) {
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.length > EXAMPLE_MAX_COLUMNS)
      fail(relative(docs, path), `line ${i + 1} is ${line.length} columns; the docs show ${EXAMPLE_MAX_COLUMNS} without a sideways scroll`);
  });
  const rel = relative(examples, path);
  if (rel.startsWith("nextjs/")) {
    const shared = join(examples, "shared", rel.slice("nextjs/".length));
    if (existsSync(shared)) {
      const expected = `"use client";\n\n${readFileSync(shared, "utf8")}`;
      if (readFileSync(path, "utf8") !== expected)
        fail(relative(docs, path), `differs from shared/${rel.slice("nextjs/".length)} + "use client": keep the two identical`);
    }
  }
}

// ---------- report ----------

if (problems.length) {
  console.error(`docs check: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`docs check: ${pages.length} pages, ${exampleFiles.length} example files, no problems`);
