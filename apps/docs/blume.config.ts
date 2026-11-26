import { fileURLToPath } from "node:url";
import { defineConfig } from "blume";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * The landing page's blocks import "@/components/…" and "@/lib/…", as shadcn writes them. Blume's Astro project
 * lives in the generated .blume/ folder, so this app's tsconfig paths never reach Vite: alias them here.
 */
const appAlias = {
  name: "webmcp-agents:app-alias",
  hooks: {
    "astro:config:setup": ({ updateConfig }: { updateConfig: (config: object) => void }) =>
      updateConfig({
        vite: {
          resolve: { alias: [{ find: /^@\//, replacement: here }] },
          // Installed by bun, dependencies are real folders under node_modules/.bun, and the dependency scan walks into
          // them and reaches their tests (which import packages nobody installed). Keep the scan out of node_modules.
          optimizeDeps: { entries: ["!**/node_modules/**"] },
        },
      }),
  },
};

/** The backends that had a recipe page under /observability/backends, now each an installation page. */
const FORMER_BACKEND_PAGES = [
  "otlp",
  "arize",
  "braintrust",
  "datadog",
  "helicone",
  "instana",
  "laminar",
  "langfuse",
  "langsmith",
  "langwatch",
  "new-relic",
  "posthog",
  "sentry",
  "traceloop",
  "vercel",
  "weave",
];

const SITE_URL = (process.env.SITE_URL ?? "https://webmcp-agents.dev").replace(/\/$/, "");
export default defineConfig({
  title: "WebMCP Agents",
  description:
    "Let AI agents use your web page, and let the person on it see every step: a ghost cursor, fields typed in place, a parked confirm state.",
  // The docs live at the repo root (docs/), next to the code they describe; this app renders them under /docs.
  content: { root: "../../docs", exclude: ["README.md", "media/README.md"] }, // docs/README.md is for GitHub only
  // One site: the landing page (pages/index.astro) is the home, every docs route mounts under /docs.
  basePath: "/docs",
  github: { owner: "mustafaskyer", repo: "web-agents", dir: "apps/docs" },
  theme: {
    // the landing page's typefaces, so both halves of the site read as one
    fonts: { display: "ibm-plex-sans", body: "ibm-plex-sans", mono: "ibm-plex-mono" },
  },
  navigation: {
    // Get started, Build, Concepts, More and Examples under "Docs"; the per-API pages get their own sidebar under "Reference".
    tabs: [
      { label: "Docs", path: "/" },
      { label: "Reference", path: "/reference" },
    ],
    // The Demos page is a custom page outside the docs (pages/demos.astro): one header link back to it.
    actions: [{ href: "/demos", label: "Demos" }],
  },
  // The production origin: webmcp-agents.dev, or SITE_URL for a preview build. Canonical URLs, the sitemap, og:image
  // and `{{site-url}}` in pages (the shadcn registry, public/r/*.json, is served by this site) all use it.
  deployment: { site: SITE_URL },
  variables: { "site-url": SITE_URL },
  seo: {
    // Per-page social cards for the docs, in the landing's dark palette with the agent cursor as the mark. The home and
    // Demos pages use metadata-gen's card instead (public/metadata/og.png, components/social-meta.astro).
    og: {
      logo: "./public/logo.svg",
      palette: { background: "#0a0a0a", foreground: "#fafafa", muted: "#a3a3a3", border: "#262626", accent: "#fafafa" },
    },
  },
  // The routes the docs had before they were ordered by framework and by step (.agents/plans/15-docs-framework-first.md).
  // Written as if mounted at the root, like every docs link; Blume adds /docs. Mirrored in vercel.json.
  redirects: [
    { from: "/getting-started", to: "/installation" },
    { from: "/getting-started/quickstart", to: "/installation" },
    { from: "/getting-started/without-react", to: "/installation/no-framework" },
    { from: "/frameworks", to: "/installation" },
    { from: "/frameworks/vite", to: "/installation/vite" },
    { from: "/frameworks/nextjs", to: "/installation/nextjs" },
    { from: "/frameworks/tanstack-start", to: "/installation/tanstack-start" },
    { from: "/frameworks/astro", to: "/installation/astro" },
    { from: "/concepts/tools", to: "/build/define-a-tool" },
    { from: "/guides", to: "/build/define-a-tool" },
    { from: "/guides/forms", to: "/build/tools-with-input" },
    { from: "/guides/common-tools", to: "/build/common-tools" },
    { from: "/build/where-a-tool-is-on", to: "/build/tools-across-your-app" },
    { from: "/guides/invoke", to: "/build/call-a-tool" },
    { from: "/guides/agents", to: "/build/define-an-agent" },
    { from: "/guides/chat", to: "/build/add-the-chat" },
    { from: "/guides/devtools", to: "/build/devtools" },
    { from: "/guides/tool-descriptions", to: "/concepts/tool-descriptions" },
    { from: "/guides/on-device-agent", to: "/more/on-device-agent" },
    { from: "/guides/ai-elements", to: "/more/shadcn-chat-blocks" },
    { from: "/guides/declarative-forms", to: "/more/declarative-forms" },
    { from: "/guides/polyfill", to: "/more/polyfill" },
    { from: "/guides/deploy", to: "/more/deploy" },
    // The backend recipes became Observability's Installation pages, one per backend, like Get started's frameworks.
    // Exact paths, not a `:backend` pattern: a static build writes a redirect page only for an exact path.
    { from: "/observability/backends", to: "/observability/installation" },
    ...FORMER_BACKEND_PAGES.map((id) => ({ from: `/observability/backends/${id}`, to: `/observability/installation/${id}` })),
    { from: "/observability/browser-spans", to: "/observability/observe-agents" },
    // The telemetry reference pages merged into the Observability API pages; reference/telemetry is the index.
    { from: "/reference/telemetry/define-observability", to: "/observability/define-observability" },
    { from: "/reference/telemetry/observe-agents", to: "/observability/observe-agents" },
    { from: "/reference/telemetry/observe-agents-component", to: "/observability/observe-agents" },
    { from: "/reference/telemetry/relay", to: "/observability/relay" },
    { from: "/reference/telemetry/otlp", to: "/observability/otlp" },
    { from: "/reference/telemetry/console-exporter", to: "/observability/observe-agents" },
    { from: "/reference/telemetry/resolve-target", to: "/observability/where-spans-go" },
    { from: "/reference/telemetry/semconv", to: "/observability/spans" },
    { from: "/reference/telemetry/types", to: "/observability/spans" },
  ],
  // The OpenDesigns blocks predate the React Compiler; they run as written.
  react: { compiler: false },
  integrations: [appAlias],
});
