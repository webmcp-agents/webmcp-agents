import type { APIRoute } from "astro";

import { observability } from "@/lib/observability";

export const prerender = false;

// The page's spans arrive here. The relay checks and redacts them,
// then sends them where the server's spans go. It refuses a request
// from another origin, or with no Origin at all (a script, not a page).

// Everything it accepts reaches your backend, so limit each visitor.
// Here in memory, per instance; in production count in a shared store
// (Upstash, Redis), as for the chat: see Limits and budgets.
const seen = new Map<string, { since: number; count: number }>();
const perIp = (req: Request) => {
  const who = req.headers.get("x-forwarded-for") ?? "local";
  const now = Date.now();
  const last = seen.get(who);
  const entry =
    last && now - last.since < 60_000 ? last : { since: now, count: 0 };
  entry.count++;
  seen.set(who, entry);
  // about one batch per run: 60 a minute is plenty for a person
  if (entry.count <= 60) return undefined;
  return new Response(null, { status: 429 });
};

const relay = observability.relay({ guard: perIp });

export const POST: APIRoute = ({ request }) => relay(request);
