import { defineMeta } from "blume";

// The path, in order: each page ends with "Next". The numbers in the sidebar come from each page's `sidebar.label`.
export default defineMeta({
  title: "Build",
  order: 2,
  pages: [
    "define-a-tool",
    "tools-with-input",
    "confirm-before-it-runs",
    "tools-across-your-app",
    "common-tools",
    "call-a-tool",
    "define-an-agent",
    "add-the-chat",
    "call-an-agent",
    "style-the-cursor-and-chat",
    "devtools",
  ],
});
