/**
 * Sink 1 (design §8.3): the cursor masks a sensitive control's value in the `fill` event, the live region and the
 * spoken text, and withholds its previous value (`from`), while the field itself gets the real value.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { agentCursor } from "../cursor";
import { cleanupFixtures, fixture, modelContext, recordEvents, toolForm, uniqueName, until } from "../test-utils";
import { type AgentVisuals, installAgentVisuals } from "../visuals";
import { defineWebTool, registerWebTool, type WebTool } from "../web-tool";
import { isSensitiveControl, mask } from "./index";

const input = (html: string): HTMLElement => fixture(html).querySelector("input") as HTMLElement;

describe("isSensitiveControl", () => {
  afterEach(cleanupFixtures);

  it.each([
    "current-password",
    "new-password",
    "one-time-code",
    "cc-number",
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
    "cc-name",
    "billing cc-number",
  ])('autocomplete="%s" is sensitive', (token) => expect(isSensitiveControl(input(`<input autocomplete="${token}">`))).toBe(true));

  it('type="password", the marker on the control and on an ancestor', () => {
    expect(isSensitiveControl(input('<input type="password">'))).toBe(true);
    expect(isSensitiveControl(input('<input name="promo" data-agent-sensitive>'))).toBe(true);
    expect(isSensitiveControl(input('<div data-agent-sensitive><label>Card <input name="card"></label></div>'))).toBe(true);
  });

  it("an ordinary field, and things that are not elements, are not", () => {
    expect(isSensitiveControl(input('<input name="city" autocomplete="address-level2">'))).toBe(false);
    expect(isSensitiveControl(input('<input name="email" type="email" autocomplete="email">'))).toBe(false);
    expect(isSensitiveControl(document.createTextNode("x") as unknown as Element)).toBe(false);
    expect(isSensitiveControl(undefined as unknown as Element)).toBe(false);
  });

  it("mask is what the redactor writes for one value", () => expect(mask("hunter2")).toBe("[REDACTED]"));
});

describe("the cursor masks sensitive fields", () => {
  let visuals: AgentVisuals | null = null;
  let rec: ReturnType<typeof recordEvents>;
  const offs: Array<() => void> = [];
  let said = "";
  let watch = 0;

  beforeEach(() => {
    modelContext();
    rec = recordEvents();
    visuals = installAgentVisuals({ linger: 50, yieldToUser: false });
    said = "";
    watch = window.setInterval(() => (said += document.querySelector(".agent-sr-only")?.textContent ?? ""), 5);
  });

  afterEach(() => {
    clearInterval(watch);
    for (const off of offs.splice(0)) off();
    rec.stop();
    visuals?.destroy();
    visuals = null;
    agentCursor.resume();
    cleanupFixtures();
  });

  const fills = () => rec.events.filter((e) => e.type === "fill") as Array<Extract<(typeof rec.events)[number], { type: "fill" }>>;

  /** Register a one-field tool over `html`, call it with `value`, and return the field. */
  async function typeInto(html: string, value: string, schema: z.ZodObject = z.object({ code: z.string() }), sensitive?: string[]) {
    const id = uniqueName("t_mask");
    fixture(`<form>${html}<button type="button">Apply code</button></form>`);
    let got = "";
    offs.push(
      registerWebTool(
        defineWebTool({
          id,
          title: "Apply code",
          description: "test tool",
          inputSchema: schema,
          sensitive,
          execute: (args: { code: string }) => {
            got = args.code;
            return "ok";
          },
        }) as WebTool,
      ),
    );
    await modelContext().executeTool(id, { code: value });
    return { got, field: document.querySelector('[name="code"]') as HTMLInputElement };
  }

  it('a field with autocomplete="cc-number": masked in the event and the live region; the field has the number', async () => {
    const { got, field } = await typeInto('<input name="code" autocomplete="cc-number" value="4000000000000002">', "4242424242424242");
    expect(field.value).toBe("4242424242424242");
    expect(got).toBe("4242424242424242");
    expect(fills()).toEqual([expect.objectContaining({ field: "code", value: "••••", from: undefined })]);
    expect(said).not.toContain("4242");
  });

  it("a field inside an element marked data-agent-sensitive", async () => {
    await typeInto('<div data-agent-sensitive><input name="code" value="old"></div>', "PROMO-77");
    expect(fills()).toEqual([expect.objectContaining({ value: "••••", from: undefined })]);
    expect(said).not.toContain("PROMO-77");
  });

  it("a parameter the tool marks, or the schema marks (x-sensitive, format: password)", async () => {
    await typeInto('<input name="code">', "SECRET-1", undefined, ["code"]);
    await typeInto('<input name="code">', "SECRET-2", z.object({ code: z.string().meta({ "x-sensitive": true }) }));
    await typeInto('<input name="code">', "SECRET-3", z.object({ code: z.string().meta({ format: "password" }) }));
    expect(fills().map((f) => f.value)).toEqual(["••••", "••••", "••••"]);
    expect(said).not.toMatch(/SECRET-\d/);
  });

  it("an ordinary field carries its value and its previous value, as before", async () => {
    await typeInto('<input name="code" value="old">', "PLAIN-1");
    expect(fills()).toEqual([expect.objectContaining({ field: "code", value: "PLAIN-1", from: "old" })]);
  });

  it("a declarative form's sensitive field is masked too", async () => {
    const name = uniqueName("t_form_mask");
    toolForm(name, { fields: '<input name="card" autocomplete="cc-number"><input name="city">' });
    // the polyfill finds a declarative form when the page changes (a mutation observer)
    for (let i = 0; i < 50 && !(await modelContext().getTools()).some((t) => t.name === name); i++)
      await new Promise((r) => setTimeout(r, 10));
    await modelContext().executeTool(name, { card: "4242424242424242", city: "Cairo" });
    await until(() => fills().length === 2, 3000, "two fills");
    expect(fills().find((f) => f.field === "card")).toMatchObject({ value: "••••", from: undefined });
    expect(fills().find((f) => f.field === "city")).toMatchObject({ value: "Cairo" });
    expect(said).not.toContain("4242");
  });
});
