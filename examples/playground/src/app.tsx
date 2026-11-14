import { AgentChat, createCloudAdapter, turnstileHeaders } from "@webmcp-agents/chat";
import { createLocalAdapter, DEFAULT_MODEL } from "@webmcp-agents/local-agent";
import { WebAgentsProvider } from "@webmcp-agents/react";
import { lazy, Suspense } from "react";
import { CartPanel } from "./components/cart-panel";
import { SiteNav } from "./components/site-nav";
import { usePage } from "./hooks/use-page";
import { Orders } from "./pages/orders";
import { Shop } from "./pages/shop";
import { exportSnapshot, importSnapshot, type CartCheckpoint } from "./store/cart";
import { tools } from "./webmcp-agents/tools";

// The provider installs the devtools panel in development. `?tanstack` shows them as a tab in TanStack Devtools
// instead: the provider's panel is off (devtools={false}) and devtools.tsx places the tab. Dev only: the condition
// guards the import() itself, so the production bundle has no devtools.
const TANSTACK = import.meta.env.DEV && new URLSearchParams(location.search).has("tanstack");
const Devtools = TANSTACK ? lazy(() => import("./devtools")) : () => null;

// Once per page. Cloud checks /api/chat on first use; on-device downloads a model only after the person's click.
// With a Turnstile site key, a chat session starts only after an invisible Turnstile check (the server checks the
// token with TURNSTILE_SECRET_KEY). The site key is public; the secret never has a VITE_ prefix.
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const cloud = createCloudAdapter({ sessionHeaders: SITE_KEY ? turnstileHeaders({ siteKey: SITE_KEY }) : undefined });
const ADAPTERS = [cloud, createLocalAdapter({ models: [DEFAULT_MODEL, "onnx-community/Qwen3-1.7B-ONNX"] })];

export default function App() {
  const { page } = usePage();

  return (
    <WebAgentsProvider tools={tools} devtools={!TANSTACK}>
      <SiteNav />

      <main className="mx-auto grid max-w-5xl items-start gap-6 px-4 pt-6 pb-40 lg:grid-cols-[1fr_20rem]">
        {page === "orders" ? <Orders /> : <Shop />}
        <CartPanel />
      </main>

      <AgentChat
        adapters={ADAPTERS}
        position={import.meta.env.DEV ? "bottom-left" : "bottom-right"}
        getSnapshot={exportSnapshot}
        applySnapshot={({ app }) => {
          if (app) importSnapshot(app as CartCheckpoint);
        }}
      />
      <Suspense>
        <Devtools />
      </Suspense>
    </WebAgentsProvider>
  );
}
