import { WebAgentsProvider } from "@webmcp-agents/react";
import type { ReactNode } from "react";

// The page's rules, in place before any tool registers.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <WebAgentsProvider
      redact={{
        keys: (defaults) => [...defaults, "loyaltyId"],
        patterns: { phone: true },
        style: "indexed",
      }}
    >
      {children}
    </WebAgentsProvider>
  );
}
