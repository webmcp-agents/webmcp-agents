/**
 * `<WebAgentsProvider redact>` and `useWebTool({ sensitive })`: the page's rules while the provider is mounted, the
 * previous ones after; a sensitive parameter masked in the `fill` event while `execute` and listeners keep the value.
 */
import { type AgentEvent, onAgentEvent } from "@webmcp-agents/core";
import { configureRedaction, createRedactor, getRedactor } from "@webmcp-agents/core/redact";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { WebAgentsProvider } from "./provider";
import { modelContext, sleep, uniqueName, until } from "@webmcp-agents/testing";
import { useWebTool } from "./use-web-tool";

describe("<WebAgentsProvider redact>", () => {
  beforeAll(() => modelContext());
  afterEach(async () => {
    configureRedaction({});
    await sleep(20);
  });

  it("makes its rules the page's while mounted, and puts the previous ones back after", async () => {
    const before = createRedactor({ token: "#" });
    configureRedaction(before);
    const screen = await render(
      <WebAgentsProvider visuals={false} redact={{ keys: (d) => [...d, "loyaltyId"] }}>
        <p>page</p>
      </WebAgentsProvider>,
    );
    expect(getRedactor()({ loyaltyId: "L-99", password: "p" })).toEqual({ loyaltyId: "[REDACTED]", password: "[REDACTED]" });
    await screen.unmount();
    expect(getRedactor()).toBe(before);
  });

  it("takes a ready redactor as is", async () => {
    const own = createRedactor({ token: "!" });
    const screen = await render(<WebAgentsProvider visuals={false} redact={own} />);
    expect(getRedactor()).toBe(own);
    await screen.unmount();
  });

  it("without the prop, the default rules are on", async () => {
    const screen = await render(<WebAgentsProvider visuals={false} />);
    expect(getRedactor()({ authToken: "t" })).toEqual({ authToken: "[REDACTED]" });
    await screen.unmount();
  });
});

function Traveler({ id, got }: { id: string; got: string[] }) {
  useWebTool({
    id,
    title: "Save traveler",
    description: "Save the traveler's passport.",
    inputSchema: z.object({ fullName: z.string(), passport: z.string() }),
    sensitive: ["passport"],
    execute: ({ passport }) => {
      got.push(passport);
      return { saved: true };
    },
  });
  return (
    <form>
      <input name="fullName" aria-label="Full name" />
      <input name="passport" aria-label="Passport" />
      <button type="button">Save traveler</button>
    </form>
  );
}

describe("useWebTool({ sensitive })", () => {
  beforeAll(() => modelContext());

  it("masks the parameter in the fill event; execute and onAgentEvent keep the real value", async () => {
    const id = uniqueName("w_traveler");
    const got: string[] = [];
    const events: AgentEvent[] = [];
    const off = onAgentEvent((e) => {
      if ("tool" in e && e.tool === id) events.push(e);
    });
    const screen = await render(
      <WebAgentsProvider>
        <Traveler id={id} got={got} />
      </WebAgentsProvider>,
    );
    await until(async () => (await modelContext().getTools()).some((t) => t.name === id), 3000, "registered");
    await modelContext().executeTool(id, { fullName: "Sara Lee", passport: "A1234567" });
    expect(got).toEqual(["A1234567"]);
    expect((document.querySelector('[name="passport"]') as HTMLInputElement).value).toBe("A1234567");
    const fills = events.filter((e): e is Extract<AgentEvent, { type: "fill" }> => e.type === "fill");
    expect(fills.find((f) => f.field === "passport")).toMatchObject({ value: "••••", from: undefined });
    expect(fills.find((f) => f.field === "fullName")).toMatchObject({ value: "Sara Lee", from: "" });
    // listeners keep args and result as in 0.4.0
    expect(events.find((e) => e.type === "start")).toMatchObject({ args: { fullName: "Sara Lee", passport: "A1234567" } });
    expect(events.find((e) => e.type === "result")).toMatchObject({ result: { content: [{ text: JSON.stringify({ saved: true }) }] } });
    expect(document.querySelector(".agent-sr-only")?.textContent ?? "").not.toContain("A1234567");
    off();
    await screen.unmount();
  });
});
