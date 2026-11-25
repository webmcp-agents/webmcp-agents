import { expect, test, vi } from "@webmcp-agents/testing";
import {
  mockAdapter,
  text,
  toolCall,
} from "@webmcp-agents/testing/chat";
import { defineWebAgent } from "@webmcp-agents/chat/agent";
import { WebAgentsProvider } from "@webmcp-agents/react";

import { TravelerForm } from "./app/traveler-form";

const traveler = defineWebAgent({
  id: "traveler",
  instructions: "Fill in the traveler's details.",
});
const passport = "A1234567";

test("the passport is masked where the page shows it", async ({
  tools,
  events,
  mount,
}) => {
  const logs = vi.spyOn(console, "error");
  mount(
    <WebAgentsProvider>
      <TravelerForm />
    </WebAgentsProvider>,
  );
  await expect.poll(() => tools.list()).toContain("fill_traveler");
  const input = { fullName: "Sara", passport };

  const adapter = mockAdapter([
    toolCall("fill_traveler", input),
    text("Done."),
  ]);
  await traveler.invoke(`Book for Sara, passport ${passport}`, {
    adapter,
  });

  // Typed into the field, shown as "••••" in the cursor's events.
  expect(events).toHaveFilled("passport");
  for (const sink of [events.of("fill"), logs]) {
    expect(sink).not.toContainSensitive([passport]);
  }
});
