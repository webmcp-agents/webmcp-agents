import {
  consoleExporter,
  observeAgents,
} from "@webmcp-agents/telemetry";

// While you build: print each span in the browser's console, and
// send nothing anywhere.
export const stop = observeAgents({ exporters: [consoleExporter()] });
