import { defineMeta } from "blume";

// One recipe per backend. "index" is the table; the generic OTLP page comes first, then by name.
export default defineMeta({
  title: "Backends",
  pages: [
    "index",
    "otlp",
    "arize",
    "braintrust",
    "datadog",
    "helicone",
    "instana",
    "laminar",
    "langfuse",
    "langsmith",
    "langwatch",
    "new-relic",
    "posthog",
    "sentry",
    "traceloop",
    "vercel",
    "weave",
  ],
});
