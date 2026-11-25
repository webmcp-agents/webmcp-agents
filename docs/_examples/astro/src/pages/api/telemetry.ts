import type { APIRoute } from "astro";

import { observability } from "@/lib/observability";

export const prerender = false;

// The page's spans arrive here. The relay checks and redacts them,
// then sends them where the server's spans go.
const relay = observability.relay();

export const POST: APIRoute = ({ request }) => relay(request);
