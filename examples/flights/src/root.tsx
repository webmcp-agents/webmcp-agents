/**
 * The layout every page renders in: the WebMCP provider, header and footer. The provider follows the URL itself,
 * so the results tools' `match` needs nothing from React Router, and installs the devtools panel in development.
 */
import { AgentChat, createCloudAdapter, turnstileHeaders } from "@webmcp-agents/chat";
import { createLocalAdapter, DEFAULT_MODEL } from "@webmcp-agents/local-agent";
import { WebAgentsProvider } from "@webmcp-agents/react";
import { Outlet, ScrollRestoration } from "react-router";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { navigate } from "./lib/navigate";
import { exportSnapshot, importSnapshot, type BookingCheckpoint } from "./store/booking";
import { concierge } from "./webmcp-agents/agents";
import { tools } from "./webmcp-agents/tools";

// Once per page. Cloud checks /api/chat on first use; on-device downloads a model only after the person's click.
// Both follow the `concierge` agent (src/webmcp-agents/agents.ts): the cloud reads it from the server registry, the on-device model here.
// two on-device models to pick from: the default, and a larger one for machines with the memory for it
// With a Turnstile site key, a chat session starts only after an invisible Turnstile check (the server checks the
// token with TURNSTILE_SECRET_KEY). The site key is public; the secret never has a VITE_ prefix.
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const cloud = createCloudAdapter({ sessionHeaders: SITE_KEY ? turnstileHeaders({ siteKey: SITE_KEY }) : undefined });
const ADAPTERS = [cloud, createLocalAdapter({ models: [DEFAULT_MODEL, "onnx-community/Qwen3-1.7B-ONNX"] })];

export function Root() {
  return (
    <WebAgentsProvider tools={tools}>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main id="main" className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
      {/* inside the provider: the assistant sees exactly the tools this page has on */}
      <AgentChat
        adapters={ADAPTERS}
        agent={concierge}
        title="Assistant"
        position={import.meta.env.DEV ? "bottom-left" : "bottom-right"}
        getSnapshot={exportSnapshot}
        applySnapshot={({ url, app }) => {
          if (app) importSnapshot(app as BookingCheckpoint);
          if (url) navigate(url);
        }}
      />
      <ScrollRestoration />
    </WebAgentsProvider>
  );
}
