import { registerOTel } from "@vercel/otel";

// instrumentation.ts in a Next.js app: Vercel's own setup, which
// registers the provider the chat's layer then finds and uses.
export function register() {
  registerOTel({ serviceName: "field-store" });
}
