import { defineMeta } from "blume";

// Locking /api/chat to your page: read in order, or jump to the layer you need.
export default defineMeta({
  title: "Security",
  order: 4,
  pages: ["index", "sessions", "tool-allowlist", "turnstile", "limits", "redaction"],
});
