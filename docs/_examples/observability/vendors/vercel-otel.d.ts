// A stand-in for
// @vercel/otel
// so the recipes type-check without installing it (tsconfig and
// knip.json map the name here). Read from its docs and published
// package on 2026-11-25.
export declare function registerOTel(options: {
  serviceName: string;
}): void;
