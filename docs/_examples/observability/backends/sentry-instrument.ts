import * as Sentry from "@sentry/node";

// Your Sentry setup, run before the app (instrument.ts, or
// instrumentation.ts in Next.js). The one addition: register
// Sentry's OpenTelemetry provider, which the chat then finds.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  enableOpenTelemetrySetup: true,
});
