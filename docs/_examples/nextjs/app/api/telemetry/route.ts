import { observability } from "@/lib/observability";

// The page's spans arrive here. The relay checks and redacts them,
// then sends them where the server's spans go.
export const POST = observability.relay();
