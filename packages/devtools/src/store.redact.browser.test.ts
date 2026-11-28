/**
 * Sink 2 (design §8.3): the devtools log, fills, result and "copy as code" are redacted; "Reveal values" exists in
 * development only and shows the values as they were; `window.agent.invoke` still resolves with the real result.
 */
import { type AgentVisuals, defineWebTool, installAgentVisuals, registerWebTool } from "@webmcp-agents/core";
import { configureRedaction } from "@webmcp-agents/core/redact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toAgentInvokeCode } from "./copy-as-code";
import { createDevtoolsStore, type DevtoolsStore } from "./store";
import { userEvent } from "vitest/browser";
import { cleanupFixtures, fixture, modelContext, toolForm, uniqueName, until } from "@webmcp-agents/testing";

const PASSPORT = "A1234567";
const EMAIL = "sara@example.com";

describe("devtools redaction", () => {
  let visuals: AgentVisuals;
  let store: DevtoolsStore;
  const offs: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    modelContext();
    visuals = installAgentVisuals({ linger: 20, yieldToUser: false });
    store = createDevtoolsStore();
  });

  afterEach(() => {
    for (const off of offs.splice(0)) off();
    store.destroy();
    visuals.destroy();
    configureRedaction({});
    cleanupFixtures();
  });

  /** A traveler tool marking `passport`, with a field for it, answering with an email. */
  function traveler(): string {
    const id = uniqueName("save_traveler");
    fixture(
      '<form><input name="passport" aria-label="Passport"><input name="loyaltyId" aria-label="Loyalty"><button type="button">Save traveler</button></form>',
    );
    offs.push(
      registerWebTool(
        defineWebTool({
          id,
          title: "Save traveler",
          description: "Save a traveler",
          inputSchema: {
            type: "object",
            properties: { passport: { type: "string" }, loyaltyId: { type: "string" } },
            required: ["passport"],
          },
          sensitive: ["passport"],
          execute: (input) => {
            const { passport, loyaltyId } = input as { passport: string; loyaltyId?: string };
            return { passport, loyaltyId, contact: EMAIL };
          },
        }),
      ),
    );
    return id;
  }

  const call = (tool: string) => store.getSnapshot().calls.find((c) => c.tool === tool);

  it("an agent's call is recorded redacted: arguments, fills, result", async () => {
    const id = traveler();
    await modelContext().executeTool(id, { passport: PASSPORT });
    const recorded = JSON.stringify(call(id));
    expect(recorded).not.toContain(PASSPORT);
    expect(recorded).not.toContain(EMAIL);
    expect(call(id)?.args).toEqual({ passport: "[REDACTED]" });
    expect(call(id)?.fills.find((f) => f.field === "passport")?.value).toBe("[REDACTED]"); // by name, over the cursor's mask
  });

  it("a run from the panel is redacted in the timeline; window.agent.invoke gets the real result", async () => {
    const id = traveler();
    const result = await window.agent?.invoke(id, { passport: PASSPORT });
    expect(JSON.stringify(result)).toContain(EMAIL);
    expect(JSON.stringify(call(id))).not.toContain(PASSPORT);
    expect(JSON.stringify(call(id))).not.toContain(EMAIL);
  });

  it("copy as code is redacted until the values are revealed (development only)", async () => {
    const id = traveler();
    const args = { passport: PASSPORT };
    expect(toAgentInvokeCode(id, store.shown(id, args))).not.toContain(PASSPORT);
    expect(store.getSnapshot().canReveal).toBe(true); // Vitest runs as a development build
    store.setRevealed(true);
    expect(toAgentInvokeCode(id, store.shown(id, args))).toContain(PASSPORT);
  });

  it("reveal shows the values as they were", async () => {
    const id = traveler();
    await modelContext().executeTool(id, { passport: PASSPORT });
    const record = call(id);
    expect(record && JSON.stringify(store.raw(record.id))).toContain(PASSPORT);
    store.clearCalls();
    expect(record && store.raw(record.id)).toBeUndefined();
  });

  it("a waiting call's prompt is redacted; reveal shows it as it was", async () => {
    const id = uniqueName("send_invite_x");
    const form = toolForm(id, { autosubmit: false, submit: `Send to ${EMAIL}` });
    await new Promise((r) => setTimeout(r, 0));
    const run = store.runTool(id, { qty: 1 });
    await until(() => call(id)?.status === "waiting", 5000, "waiting");
    expect(call(id)?.prompt).toMatch(/Send to/);
    expect(call(id)?.prompt).not.toContain(EMAIL);
    const record = call(id);
    expect(record && store.raw(record.id)?.prompt).toContain(EMAIL);
    await userEvent.click(form.querySelector("button") as HTMLButtonElement);
    expect((await run).status).toBe("ok");
  });

  it("configured after a call was logged: the next call follows the new rules", async () => {
    const id = traveler();
    await modelContext().executeTool(id, { passport: PASSPORT, loyaltyId: "L-99" });
    expect(JSON.stringify(call(id)?.args)).toContain("L-99");
    configureRedaction({ keys: (d) => [...d, "loyaltyId"] });
    await modelContext().executeTool(id, { passport: PASSPORT, loyaltyId: "L-99" });
    expect(JSON.stringify(call(id))).not.toContain("L-99");
  });
});
