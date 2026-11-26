import {
  ATTR_CUSTOM,
  defineObservability,
} from "@webmcp-agents/telemetry/server";

// Every span the app created carries webmcp.custom: true. This
// layer exports the library's spans and drops the app's own.
export const observability = defineObservability({
  spanFilter: (span) => span.attributes[ATTR_CUSTOM] !== true,
});
