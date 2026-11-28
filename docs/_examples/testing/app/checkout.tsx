import { useWebTool } from "@webmcp-agents/react";

import { orders } from "./orders";

export function Checkout() {
  const place = () => {
    orders.add(`FS-${orders.get().length + 1}`);
    return "Order placed.";
  };

  // The agent's call waits for the person's click on the button.
  useWebTool({
    id: "place_order",
    title: "Place order",
    description:
      "Place the order for what is in the cart. The user confirms " +
      "on the page.",
    requireConfirmation: true,
    execute: place,
  });

  return (
    <button type="button" onClick={place}>
      Place order
    </button>
  );
}
