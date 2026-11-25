import { defineMeta } from "blume";

// Testing what you build: one page per layer, in the order you would add tests.
export default defineMeta({
  title: "Testing",
  order: 6,
  pages: [
    "index",
    "test-a-tool",
    "test-a-tool-on-the-page",
    "confirmations",
    "test-an-agent",
    "test-the-chat",
    "test-the-endpoint",
    "privacy-and-telemetry",
    "end-to-end",
    "ci",
  ],
});
