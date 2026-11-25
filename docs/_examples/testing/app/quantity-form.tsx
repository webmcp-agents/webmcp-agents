import { useWebTool } from "@webmcp-agents/react";
import { useState } from "react";
import { z } from "zod";

export function QuantityForm() {
  const [qty, setQty] = useState(1);

  // The cursor types `qty` into the field named "qty", then
  // clicks the button named "Set quantity".
  useWebTool({
    id: "set_quantity",
    title: "Set quantity",
    description: "Set how many mugs to buy. Answers the new quantity.",
    inputSchema: z.object({
      qty: z.number().int().min(1).describe("How many, e.g. 3."),
    }),
    execute: ({ qty }) => {
      setQty(qty);
      return `Quantity set to ${qty}.`;
    },
  });

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <label>
        Quantity <input name="qty" type="number" defaultValue={qty} />
      </label>
      <button type="submit">Set quantity</button>
    </form>
  );
}
