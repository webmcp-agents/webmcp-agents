import { onAgentRun } from "@webmcp-agents/chat";

// A stand-in for your analytics client.
declare const analytics: {
  track(event: string, data: Record<string, unknown>): void;
};

// No telemetry package: the run events, redacted, to your own
// analytics. Returns a function that stops listening.
export const stop = onAgentRun((event) => {
  if (event.type === "tool-finish" && event.state === "error") {
    analytics.track("agent_tool_failed", {
      tool: event.tool,
      code: event.code,
    });
  }
  if (event.type === "run-finish") {
    analytics.track("agent_run", {
      reason: event.reason,
      steps: event.steps,
      ms: Math.round(event.ms),
    });
  }
});
