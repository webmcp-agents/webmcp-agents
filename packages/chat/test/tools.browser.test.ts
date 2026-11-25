import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { toolErrorCode, waitingForUser } from "@webmcp-agents/core";
import { callModelContextTool, listToolDescriptors, NAVIGATED } from "../src/tools";
import { cleanupFixtures, echoForm, modelContext, uniqueName, until } from "@webmcp-agents/testing";

describe("page tools for an agent", () => {
  let mc: ModelContext;
  beforeAll(() => {
    mc = modelContext();
  });
  afterEach(cleanupFixtures);

  it("lists declarative and imperative tools with object schemas", async () => {
    const form = uniqueName("echo");
    const imperative = uniqueName("ping");
    echoForm(form);
    mc.registerTool({ name: imperative, description: "Ping", inputSchema: { type: "object", properties: {} }, execute: () => "pong" });
    await until(() => true);
    const tools = await listToolDescriptors();
    expect(tools.find((t) => t.name === form)).toMatchObject({
      description: "Echo a word back. Second sentence.",
      inputSchema: { type: "object" },
    });
    expect(tools.find((t) => t.name === imperative)).toMatchObject({ description: "Ping" });
    mc.unregisterTool!(imperative);
  });

  it("returns normalized output, marks Error: answers and throws as isError", async () => {
    const name = uniqueName("echo");
    echoForm(name);
    await until(() => true);
    expect(await callModelContextTool({ name, input: { word: "hi" } })).toEqual({ content: [{ type: "text", text: "ok: hi" }] });

    const failing = uniqueName("echo");
    echoForm(failing, { prefix: "Error: no " });
    await until(() => true);
    const failed = await callModelContextTool({ name: failing, input: { word: "hi" } });
    expect(failed).toMatchObject({ isError: true, content: [{ text: "Error [failed]: no hi" }] });
    expect(toolErrorCode(failed)).toBe("failed");

    const thrower = uniqueName("boom");
    mc.registerTool({
      name: thrower,
      description: "Boom",
      execute: () => {
        throw new Error("kaput");
      },
    });
    expect(await callModelContextTool({ name: thrower, input: {} })).toMatchObject({
      isError: true,
      content: [{ text: expect.stringMatching(/^Error \[failed\]: .*kaput/) }],
    });
    expect(await callModelContextTool({ name: uniqueName("missing"), input: {} })).toMatchObject({
      isError: true,
      content: [{ text: expect.stringMatching(/^Error \[unavailable\]: .*not on this page/) }],
      structuredContent: { error: { code: "unavailable", retryable: true } },
    });
    mc.unregisterTool!(thrower);
  });

  it("an abort cancels the tool and answers Cancelled", async () => {
    const name = uniqueName("slow");
    let toolSignal: AbortSignal | undefined;
    mc.registerTool({
      name,
      description: "Slow",
      execute: (_args, { signal }) => {
        toolSignal = signal;
        return new Promise(() => {});
      },
    });
    const ctrl = new AbortController();
    const pending = callModelContextTool({ name, input: {} }, { signal: ctrl.signal });
    await new Promise((r) => setTimeout(r, 20));
    ctrl.abort();
    expect(await pending).toEqual({ content: [{ type: "text", text: "Error [cancelled]: Cancelled by the user." }], isError: true });
    expect(toolSignal?.aborted).toBe(true); // cancelled through executeTool's signal, as in Chrome
    mc.unregisterTool!(name);
  });

  it("a call the page cancelled (not the user) is a recoverable error, not 'Cancelled by the user'", async () => {
    const name = uniqueName("interrupted");
    mc.registerTool({ name, description: "Slow", execute: () => new Promise(() => {}) });
    const pending = callModelContextTool({ name, input: {} });
    await new Promise((r) => setTimeout(r, 20));
    mc.cancelTool?.(name); // the browser cancelling it, e.g. on navigation
    const result = await pending;
    expect(toolErrorCode(result)).toBe("interrupted");
    expect(result.content[0]?.text).toMatch(/^Error \[interrupted\]: The page cancelled this call/);
    mc.unregisterTool!(name);
  });

  it("a tool that doesn't answer in time is stopped with a timeout error the agent can act on", async () => {
    const name = uniqueName("stuck");
    let toolSignal: AbortSignal | undefined;
    mc.registerTool({
      name,
      description: "Stuck",
      execute: (_args, { signal }) => {
        toolSignal = signal;
        return new Promise(() => {});
      },
    });
    const result = await callModelContextTool({ name, input: {} }, { timeoutMs: 50 });
    expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: "timeout", retryable: true } } });
    expect(result.content[0]?.text).toMatch(/^Error \[timeout\]: .*didn't answer within/);
    expect(toolSignal?.aborted).toBe(true); // the call is cancelled, not left running
    mc.unregisterTool!(name);
  });

  it("no timeout while a declarative form waits for the person's click, even without the visuals' park event", async () => {
    const name = uniqueName("confirm");
    const form = echoForm(name, { autosubmit: false });
    await until(() => true);
    const pending = callModelContextTool({ name, input: { word: "hi" } }, { timeoutMs: 30 });
    const button = form.querySelector("button")!;
    await until(() => button.hasAttribute("data-tool-submit-active"));
    await new Promise((r) => setTimeout(r, 80)); // well past the time limit
    button.click();
    expect(await pending).toEqual({ content: [{ type: "text", text: "ok: hi" }] });
  });

  it("coding a page's plain error keeps the tool's own structured data; 'Error rate…' is not an error", async () => {
    const name = uniqueName("data");
    mc.registerTool({
      name,
      description: "Data",
      execute: () => ({ content: [{ type: "text", text: "Error: too many" }], isError: true, structuredContent: { max: 5 } }),
    });
    expect(await callModelContextTool({ name, input: {} })).toMatchObject({
      isError: true,
      content: [{ text: "Error [failed]: too many" }],
      structuredContent: { max: 5, error: { code: "failed" } },
    });
    const fine = uniqueName("rate");
    mc.registerTool({ name: fine, description: "Rate", execute: () => "Error rate: 0.2%" });
    expect(await callModelContextTool({ name: fine, input: {} })).toEqual({ content: [{ type: "text", text: "Error rate: 0.2%" }] });
    mc.unregisterTool!(name);
    mc.unregisterTool!(fine);
  });

  it("no timeout while the tool waits for the person", async () => {
    const name = uniqueName("asks");
    let answer!: (v: string) => void;
    mc.registerTool({
      name,
      description: "Asks",
      execute: () => {
        waitingForUser(name, "Choose a size");
        return new Promise<string>((r) => (answer = r));
      },
    });
    const pending = callModelContextTool({ name, input: {} }, { timeoutMs: 30 });
    await new Promise((r) => setTimeout(r, 80));
    answer("Added M");
    expect(await pending).toEqual({ content: [{ type: "text", text: "Added M" }] });
    mc.unregisterTool!(name);
  });

  it("a call that navigated (null) says so", async () => {
    const name = uniqueName("nav");
    mc.registerTool({ name, description: "Nav", execute: () => "x" });
    const exec = vi.spyOn(mc, "executeTool").mockResolvedValueOnce(null as never);
    expect(await callModelContextTool({ name, input: {} })).toEqual({ content: [{ type: "text", text: NAVIGATED }] });
    exec.mockRestore();
    mc.unregisterTool!(name);
  });
});
