// A stand-in for
// dd-trace
// so the recipes type-check without installing it (tsconfig and
// knip.json map the name here). Read from its docs and published
// package on 2026-11-25.
interface Tracer {
  init(options?: { service?: string }): Tracer;
  TracerProvider: new () => { register(): void };
}
declare const tracer: Tracer;
export default tracer;
