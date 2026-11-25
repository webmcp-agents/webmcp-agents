import tracer from "dd-trace";

// Loaded before anything else (node --import ./tracer.js): dd-trace
// as the process's OpenTelemetry provider, which the layer finds.
const dd = tracer.init({ service: "field-store" });
new dd.TracerProvider().register();
