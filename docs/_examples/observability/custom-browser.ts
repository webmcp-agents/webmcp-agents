import {
  recordAgentEvent,
  withAgentSpan,
} from "@webmcp-agents/telemetry";

// Something the page saw happen during the run: an event on the
// run's invoke_agent span.
export function couponApplied(code: string, total: number) {
  recordAgentEvent("cart.coupon_applied", {
    "cart.coupon": code,
    "cart.total": total,
  });
}

// Work the page does while a tool runs: a span under that tool
// call, timed around the call. It returns what the call returns.
export function searchFlights(query: string) {
  return withAgentSpan(
    "search.query",
    () => fetch(`/api/search?q=${encodeURIComponent(query)}`),
    { "search.kind": "flights" },
  );
}
