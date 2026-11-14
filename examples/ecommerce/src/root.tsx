/**
 * The layout every page renders in: the WebMCP provider, header and cart drawer. The provider follows the URL
 * itself, so it needs nothing from React Router, and installs the devtools panel in development.
 */
import { AgentChat, createCloudAdapter, turnstileHeaders } from "@webmcp-agents/chat";
import { createLocalAdapter, DEFAULT_MODEL } from "@webmcp-agents/local-agent";
import { WebAgentsProvider } from "@webmcp-agents/react";
import { Outlet, ScrollRestoration } from "react-router";
import { CartDrawer } from "./components/cart-drawer";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { useUi } from "./hooks/use-ui";
import { navigate } from "./lib/navigate";
import { exportSnapshot, importSnapshot, type CartCheckpoint } from "./store/cart";
import { ui } from "./store/ui";
import { shopper } from "./webmcp-agents/agents";
import { tools } from "./webmcp-agents/tools";

// Once per page. Cloud checks /api/chat on first use; on-device downloads a model only after the person's click.
// Both follow the `shopper` agent (src/webmcp-agents/agents.ts): the cloud reads it from the server registry, the
// on-device model here. Two on-device models to pick from: the default, and a larger one for machines with the memory.
// With a Turnstile site key, a chat session starts only after an invisible Turnstile check (the server checks the
// token with TURNSTILE_SECRET_KEY). The site key is public; the secret never has a VITE_ prefix.
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const cloud = createCloudAdapter({ sessionHeaders: SITE_KEY ? turnstileHeaders({ siteKey: SITE_KEY }) : undefined });
const ADAPTERS = [cloud, createLocalAdapter({ models: [DEFAULT_MODEL, "onnx-community/Qwen3-1.7B-ONNX"] })];

export function Root() {
  const { cartOpen } = useUi();

  return (
    <WebAgentsProvider tools={tools}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* inert while the drawer is open: the drawer behaves as a modal without entering the top layer,
          where it would hide the agent cursor and block the devtools */}
      <div className="flex min-h-dvh flex-col" inert={cartOpen}>
        <Header />
        <main id="main" className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>

      <CartDrawer />

      {/* inside the provider: the assistant sees exactly the tools this page has on */}
      <AgentChat
        adapters={ADAPTERS}
        agent={shopper}
        title="Assistant"
        position={import.meta.env.DEV ? "bottom-left" : "bottom-right"}
        getSnapshot={() => ({ cart: exportSnapshot(), cartOpen: ui.cartOpen })}
        applySnapshot={({ url, app }) => {
          const snap = app as { cart?: CartCheckpoint; cartOpen?: boolean } | undefined;
          if (snap?.cart) importSnapshot(snap.cart);
          if (typeof snap?.cartOpen === "boolean") {
            if (snap.cartOpen) ui.openCart();
            else ui.closeCart();
          }
          if (url) navigate(url);
        }}
      />
      <ScrollRestoration />
    </WebAgentsProvider>
  );
}
