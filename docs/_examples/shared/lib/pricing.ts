import { cart } from "./cart";
import { observability } from "./observability";

// A step of your own during a chat request (called from a
// server-side tool or prepareAgent): a span in the turn's trace,
// timed around the work.
export function quote() {
  const { lines, total } = cart.describe();
  return observability.span("pricing.quote", async () => total, {
    "cart.items": lines.length,
  });
}

// Something that happened, with no duration: a zero-length span.
export function stockChecked(sku: string, left: number) {
  observability.event("inventory.checked", {
    "inventory.sku": sku,
    "inventory.left": left,
  });
}
