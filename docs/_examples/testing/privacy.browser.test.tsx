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

test("a passport number leaves the page nowhere", async ({
  tools,
  events,
  runs,
  spans,
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
  await spans.flush();

  // Typed into the field, "••••" in the cursor's events.
  expect(events).toHaveFilled("passport");
  // The run events and the spans carry the tool call, redacted.
  expect(runs).toHaveCalledTools(["fill_traveler"]);
  expect(spans).toHaveSpan("execute_tool fill_traveler");

  const sinks = [events.of("fill"), runs, spans, logs];
  for (const sink of sinks) {
    expect(sink).not.toContainSensitive([passport]);
  }
});
