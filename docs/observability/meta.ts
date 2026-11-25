import { defineMeta } from "blume";

// Sending agent runs to an observability backend: the overview, then one topic per page, then a recipe per backend.
export default defineMeta({
  title: "Observability",
  order: 5,
  pages: ["index", "where-spans-go", "privacy", "browser-spans", "on-agent-run", "collector", "backends"],
});
