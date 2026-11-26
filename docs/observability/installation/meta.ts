import { defineMeta } from "blume";

// A disclosure inside Observability, open from the start, like Installation inside Get started: its row opens the
// index page (the backend cards); one page per backend, the generic OTLP page first, then by name.
export default defineMeta({
  title: "Installation",
  display: "group",
  collapsed: false,
  pages: [
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
