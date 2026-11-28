import { configureRedaction } from "@webmcp-agents/core/redact";

// No framework: the same rules, once, before tools run.
configureRedaction({
  paths: ["output.*.address"],
  allowQuery: ["page", "sort"],
});
