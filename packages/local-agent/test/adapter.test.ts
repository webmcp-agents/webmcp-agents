import type { AdapterStatus, AgentStreamPart } from "@webmcp-agents/chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAdapter } from "../src/index";
import type { LocalProvider, ProviderAvailability } from "../src/types";

beforeEach(() => vi.stubGlobal("window", {}));
afterEach(() => vi.unstubAllGlobals());

function provider(id: string, availability: ProviderAvailability, over: Partial<LocalProvider> = {}): LocalProvider {
  return {
    id,
    label: id,
    availability: async () => availability,
    prepare: async (onProgress) => {
      onProgress(0.5);
      onProgress(1);
    },
    generate: async () => ({ text: "Hi from the device." }),
    ...over,
  };
}

/** Wait for the adapter to settle its status. */
async function settled(adapter: ReturnType<typeof createLocalAdapter>): Promise<AdapterStatus> {
  adapter.status!();
  for (let i = 0; i < 20 && adapter.status!().state === "loading"; i++) await new Promise((r) => setTimeout(r, 0));
  return adapter.status!();
}

describe("createLocalAdapter", () => {
  it("picks the first available provider, else the first that can download, else explains", async () => {
    const ready = createLocalAdapter({
      providers: [provider("a", { state: "needs-download", bytes: 5 }), provider("b", { state: "available" })],
    });
    expect(await settled(ready)).toEqual({ state: "ready" });
    const download = createLocalAdapter({
      providers: [provider("a", { state: "unavailable", reason: "no" }), provider("b", { state: "needs-download", bytes: 9 })],
    });
    expect(await settled(download)).toEqual({ state: "needs-download", bytes: 9, note: undefined });
    const none = createLocalAdapter({ providers: [provider("a", { state: "unavailable", reason: "No WebGPU." })] });
    expect(await settled(none)).toEqual({ state: "unavailable", reason: "No WebGPU." });
  });

  it("prepare reports progress to subscribers and ends ready; then run answers", async () => {
    const adapter = createLocalAdapter({ providers: [provider("t", { state: "needs-download", bytes: 9 })] });
    await settled(adapter);
    const seen: AdapterStatus[] = [];
    adapter.subscribe!(() => seen.push(adapter.status!()));
    await adapter.prepare!();
    expect(seen).toEqual([
      { state: "downloading", progress: 0 },
      { state: "downloading", progress: 0.5 },
      { state: "downloading", progress: 1 },
      { state: "ready" },
    ]);
    const parts: AgentStreamPart[] = [];
    const req = {
      messages: [{ id: "u", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
      tools: [],
      signal: new AbortController().signal,
      callTool: vi.fn(),
    };
    for await (const p of adapter.run(req)) parts.push(p);
    expect(parts.find((p) => p.type === "text-delta")).toMatchObject({ delta: "Hi from the device." });
  });

  it("a cancelled download goes back to needs-download; a failed one is an error", async () => {
    const cancelling = createLocalAdapter({
      providers: [
        provider(
          "t",
          { state: "needs-download", bytes: 9 },
          {
            prepare: (_p, signal) =>
              new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))),
          },
        ),
      ],
    });
    await settled(cancelling);
    const ctrl = new AbortController();
    const pending = cancelling.prepare!(ctrl.signal);
    ctrl.abort();
    await pending;
    expect(cancelling.status!()).toEqual({ state: "needs-download", bytes: 9, note: undefined });

    const failing = createLocalAdapter({
      providers: [
        provider(
          "t",
          { state: "needs-download" },
          {
            prepare: async () => {
              throw new Error("Quota exceeded");
            },
          },
        ),
      ],
    });
    await settled(failing);
    await expect(failing.prepare!()).rejects.toThrow("Quota exceeded");
    expect(failing.status!()).toEqual({ state: "error", error: "The model couldn't load: Quota exceeded" });
  });

  it("a prepare that had nothing to do doesn't block the next one", async () => {
    let calls = 0;
    const adapter = createLocalAdapter({
      providers: [
        provider(
          "t",
          { state: "needs-download" },
          {
            prepare: async () => {
              calls++;
            },
          },
        ),
      ],
    });
    await settled(adapter);
    const aborted = new AbortController();
    aborted.abort();
    await adapter.prepare!(aborted.signal); // returns early
    await adapter.prepare!();
    expect(calls).toBe(1);
    expect(adapter.status!()).toEqual({ state: "ready" });
  });

  it("a provider that turns out broken hands over to the next one", async () => {
    let brokenReason: string | undefined;
    const flaky: LocalProvider = {
      ...provider("chrome", { state: "available" }),
      get broken() {
        return brokenReason;
      },
      generate: async () => {
        brokenReason = "Chrome's model couldn't start.";
        throw new Error("Chrome's model couldn't start. Switching to the downloadable model.");
      },
    };
    const adapter = createLocalAdapter({ providers: [flaky, provider("transformers", { state: "needs-download", bytes: 5 })] });
    expect(await settled(adapter)).toEqual({ state: "ready" });
    const parts: AgentStreamPart[] = [];
    const req = {
      messages: [{ id: "u", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
      tools: [],
      signal: new AbortController().signal,
      callTool: vi.fn(),
    };
    for await (const p of adapter.run(req)) parts.push(p);
    // no error and no empty bubble: a plain note pointing at the download card
    expect(parts.map((p) => p.type)).toEqual(["message-start", "text-delta", "finish"]);
    expect(parts[1]).toMatchObject({ delta: expect.stringMatching(/can't run on this device. Download the on-device model below/) });
    // the broken provider's step never showed anything: its step-start was dropped with its message-start
    expect(await settled(adapter)).toEqual({ state: "needs-download", bytes: 5, note: undefined });
  });

  it("when the next provider's model is cached, a broken one hands over and the same message is answered", async () => {
    const flaky: LocalProvider = {
      ...provider("chrome", { state: "available" }),
      broken: undefined as string | undefined,
      generate: async () => {
        (flaky as { broken?: string }).broken = "no";
        throw new Error("no");
      },
    };
    const cached = provider("transformers", { state: "needs-download", bytes: 5, cached: true });
    const adapter = createLocalAdapter({ providers: [flaky, cached] });
    await settled(adapter);
    const parts: AgentStreamPart[] = [];
    for await (const p of adapter.run({
      messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }],
      tools: [],
      signal: new AbortController().signal,
      callTool: vi.fn(),
    }))
      parts.push(p);
    expect(parts.filter((p) => p.type === "message-start")).toHaveLength(1);
    expect(parts.find((p) => p.type === "text-delta")).toMatchObject({ delta: "Hi from the device." });
    expect(parts.some((p) => p.type === "error")).toBe(false);
  });

  it("a model cached on an earlier visit is ready without a click, and loads on the first message", async () => {
    const prepare = vi.fn(async (onProgress: (p: number) => void) => onProgress(1));
    const adapter = createLocalAdapter({ providers: [provider("t", { state: "needs-download", bytes: 5, cached: true }, { prepare })] });
    expect(await settled(adapter)).toEqual({ state: "ready" });
    expect(prepare).not.toHaveBeenCalled(); // nothing loads until it's used
    const seen: AdapterStatus[] = [];
    adapter.subscribe!(() => seen.push(adapter.status!()));
    const parts: AgentStreamPart[] = [];
    for await (const p of adapter.run({
      messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "hi" }] }],
      tools: [],
      signal: new AbortController().signal,
      callTool: vi.fn(),
    }))
      parts.push(p);
    expect(prepare).toHaveBeenCalledOnce();
    expect(seen.at(0)).toEqual({ state: "loading", progress: 0 }); // from disk: never shown as a download
    expect(seen.at(-1)).toEqual({ state: "ready" });
    expect(parts.find((p) => p.type === "text-delta")).toMatchObject({ delta: "Hi from the device." });
  });

  it("run before ready is an error part, not a throw", async () => {
    const adapter = createLocalAdapter({ providers: [provider("t", { state: "needs-download" })] });
    await settled(adapter);
    const parts: AgentStreamPart[] = [];
    for await (const p of adapter.run({ messages: [], tools: [], signal: new AbortController().signal, callTool: vi.fn() })) parts.push(p);
    expect(parts).toEqual([{ type: "error", error: "The on-device model isn't ready: download it first." }]);
  });

  it("lists the provider's models and switches between them, but never mid-reply", async () => {
    const selectModel = vi.fn(async () => {});
    const models = () => [
      { id: "small", label: "Small", brief: "Fast.", selected: true },
      { id: "big", label: "Big", brief: "Smarter.", bytes: 9 },
    ];
    let gate: () => void = () => {};
    const adapter = createLocalAdapter({
      providers: [
        provider(
          "t",
          { state: "available" },
          {
            models,
            selectModel,
            generate: () => new Promise((resolve) => (gate = () => resolve({ text: "done" }))),
          },
        ),
      ],
    });
    expect(adapter.models!()).toEqual([]); // nothing until detection ran
    expect(await settled(adapter)).toEqual({ state: "ready" });
    expect(adapter.models!().map((m) => m.id)).toEqual(["small", "big"]);

    const req = {
      messages: [{ id: "u", role: "user" as const, parts: [{ type: "text" as const, text: "hi" }] }],
      tools: [],
      signal: new AbortController().signal,
      callTool: vi.fn(),
    };
    const it = adapter.run(req)[Symbol.asyncIterator]();
    const first = it.next(); // starts generating
    await new Promise((r) => setTimeout(r, 0));
    await expect(adapter.selectModel!("big")).rejects.toThrow(/busy/);
    gate();
    await first;
    for (let step = await it.next(); !step.done; step = await it.next());

    await adapter.selectModel!("big");
    expect(selectModel).toHaveBeenCalledWith("big");
    expect(await settled(adapter)).toEqual({ state: "ready" }); // re-detected for the new model
  });
});
