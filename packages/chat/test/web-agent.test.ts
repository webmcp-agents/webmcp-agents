import { ToolLoopAgent } from "ai";
import { describe, expect, it } from "vitest";
import { defineWebAgent } from "../src/agent";
import { DEFAULT_SYSTEM_PROMPT } from "../src/server/system-prompt";
import { toToolLoopAgent, toToolLoopAgentSettings, toToolSet } from "../src/server/web-agent";
import type { ToolDescriptor } from "../src/types";
import { mockModel } from "@webmcp-agents/testing/server";

const t = (name: string): ToolDescriptor => ({
  name,
  description: `${name}\u0007 does things`,
  inputSchema: { $schema: "x", type: "object", properties: { q: { type: "string" } } },
});
const page = [t("get_cart"), t("checkout"), t("search_products")];
const checkout = defineWebAgent({ id: "checkout", instructions: "Place the order.", tools: ["get_cart", "checkout"] });
const shopper = defineWebAgent({ id: "shopper", instructions: ["Sells mugs.", "Open first."], agents: [checkout] });

describe("toToolSet", () => {
  it("declares page tools without execute, with cleaned descriptions and sanitized schemas", () => {
    const set = toToolSet(page);
    expect(Object.keys(set)).toEqual(["get_cart", "checkout", "search_products"]);
    expect(set.get_cart!.description).toBe("get_cart does things");
    expect("execute" in set.get_cart!).toBe(false);
    expect(JSON.stringify(set.get_cart!.inputSchema)).not.toContain("$schema");
  });
});

describe("toToolLoopAgentSettings", () => {
  const model = mockModel([{ text: "ok" }]);

  it("assembles the instructions: base, page path, the agent's lines, the delegation note", () => {
    const s = toToolLoopAgentSettings(shopper, { model, tools: page, path: "/cart" });
    expect(s.id).toBe("shopper");
    expect(s.instructions).toContain(DEFAULT_SYSTEM_PROMPT.slice(0, 40));
    expect(s.instructions).toContain('The user is on the page "/cart" of this site.');
    expect(s.instructions).toContain("About this site:\nSells mugs.\nOpen first.");
    expect(s.instructions).toContain("delegate_to_<agent>");
    expect(Object.keys(s.tools ?? {})).toEqual(["get_cart", "checkout", "search_products", "delegate_to_checkout"]);
  });

  it("without an agent: the plain assistant, every page tool, no note", () => {
    const s = toToolLoopAgentSettings(undefined, { model, tools: page });
    expect(s.id).toBeUndefined();
    expect(s.instructions).not.toContain("About this site");
    expect(s.instructions).not.toContain("delegate_to_<agent>");
    expect(Object.keys(s.tools ?? {})).toEqual(["get_cart", "checkout", "search_products"]);
  });

  it("applies the sub-agent's allow-list, a replacement tool set, extra instructions and options", () => {
    const s = toToolLoopAgentSettings(checkout, {
      model,
      tools: page,
      extraInstructions: "Budget reached.",
      maxOutputTokens: 123,
      providerOptions: { openai: { reasoningEffort: "low" } },
    });
    expect(Object.keys(s.tools ?? {})).toEqual(["get_cart", "checkout"]);
    expect(s.instructions).toMatch(/Budget reached\.$/);
    expect(s.maxOutputTokens).toBe(123);
    expect(s.providerOptions).toEqual({ openai: { reasoningEffort: "low" } });
    expect(Object.keys(toToolLoopAgentSettings(checkout, { model, tools: page, toolSet: {} }).tools ?? {})).toEqual([]);
  });

  it("toToolLoopAgent returns an AI SDK ToolLoopAgent that streams with the model", async () => {
    const loop = toToolLoopAgent(shopper, { model: mockModel([{ text: "Bonjour" }]), tools: page });
    expect(loop).toBeInstanceOf(ToolLoopAgent);
    const result = await loop.stream({ prompt: "hi" });
    expect(await result.text).toBe("Bonjour");
  });
});
