import { useWebTool } from "@webmcp-agents/react";
import { z } from "zod";

export function TravelerForm() {
  // `sensitive`: the passport is masked wherever the library shows
  // or logs the call. The field itself gets the real value.
  useWebTool({
    id: "fill_traveler",
    description: "Fill in the traveler's name and passport number.",
    inputSchema: z.object({
      fullName: z.string(),
      passport: z.string(),
    }),
    sensitive: ["passport"],
    execute: () => "Traveler saved.",
  });

  return (
    <form>
      <label>
        Full name <input name="fullName" />
      </label>
      <label>
        Passport <input name="passport" />
      </label>
      {/* The tool's control: the cursor finds it by name. */}
      <button type="button">Fill traveler</button>
    </form>
  );
}
