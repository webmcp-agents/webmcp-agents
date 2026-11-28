import { defineMeta } from "blume";

// The observability path, in order: the overview, Installation (one page per backend, like Get started's one page
// per framework), the APIs one page each, then privacy, the span names and the Collector,
// one by one: the order is this list, and the labels carry no numbers (only Build numbers its path).
export default defineMeta({
  title: "Observability",
  icon: "activity",
  order: 5,
  pages: [
    "index",
    "installation",
    "apis",
    "define-observability",
    "where-spans-go",
    "otlp",
    "relay",
    "relay-through",
    "app-integrations",
    "observe-agents",
    "on-agent-run",
    "custom-events",
    "sampling",
    "metadata-mapping",
    "privacy",
    "spans",
    "collector",
  ],
});
