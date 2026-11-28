// A stand-in for
// @sentry/node
// so the recipes type-check without installing it (tsconfig and
// knip.json map the name here). Read from its docs and published
// package on 2026-11-25.
export declare function init(options: {
  dsn?: string;
  tracesSampleRate?: number;
  enableOpenTelemetrySetup?: boolean;
}): void;
