import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../src/chat.css";
import { AgentChat } from "../src/components/AgentChat";
import type { AdapterStatus, AgentAdapter, ModelChoice } from "../src/types";
import { cleanupFixtures, modelContext, until } from "@webmcp-agents/testing";

const host = () => document.querySelector<HTMLElement>(".wa-chat")!;
const q = <T extends Element = HTMLElement>(sel: string) => host().querySelector<T>(sel);

/** An adapter that offers two models and reports a status we control. */
function pickerAdapter(initial: AdapterStatus) {
  let status = initial;
  const listeners = new Set<() => void>();
  let models: ModelChoice[] = [
    {
      id: "small",
      label: "Small",
      brief: "Fastest. Good at short tool calls.",
      bytes: 585e6,
      cached: true,
      recommended: true,
      selected: true,
    },
    { id: "big", label: "Big", brief: "Better reasoning.", bytes: 1.4e9, cached: false },
  ];
  const adapter: AgentAdapter & { set(s: AdapterStatus): void; selectModel: ReturnType<typeof vi.fn> } = {
    id: "local",
    label: "On-device",
    status: () => status,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    prepare: async () => {},
    models: () => models,
    selectModel: vi.fn(async (id: string) => {
      models = models.map((m) => ({ ...m, selected: m.id === id }));
      status = id === "big" ? { state: "needs-download", bytes: 1.4e9 } : { state: "ready" };
      for (const l of listeners) l();
    }),
    set(s) {
      status = s;
      for (const l of listeners) l();
    },
    async *run() {
      yield { type: "finish", reason: "stop" };
    },
  };
  return adapter;
}

describe("<AgentChat> model picker", () => {
  beforeAll(() => modelContext());
  afterEach(() => {
    cleanupFixtures();
    sessionStorage.clear();
  });

  it("lists the adapter's models with their brief and switches on change", async () => {
    const adapter = pickerAdapter({ state: "ready" });
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    const select = q<HTMLSelectElement>(".wa-chat__model select")!;
    expect(select).not.toBeNull();
    expect([...select.options].map((o) => o.textContent)).toEqual(["Small (recommended) · on this device", "Big"]);
    expect(q(".wa-chat__model-meta")?.textContent).toBe("Fastest. Good at short tool calls. · 585 MB, on this device");

    await userEvent.selectOptions(select, "big");
    expect(adapter.selectModel).toHaveBeenCalledWith("big");
    await until(() => q(".wa-chat__model-meta")?.textContent === "Better reasoning. · 1.4 GB download", 2000, "brief of the new model");
    // the new model is not on the device: the consent card appears with its size
    expect(q(".wa-chat__download")?.textContent).toContain("Downloads 1.4 GB once.");
  });

  it("shows a cached model loading from disk as a load, with the picker disabled meanwhile", async () => {
    const adapter = pickerAdapter({ state: "loading", progress: 0.4 });
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    expect(q(".wa-chat__download-title")?.textContent).toBe("Loading the model from this device…");
    expect(q(".wa-chat__download-meta")?.textContent).toContain("40%");
    expect(q<HTMLSelectElement>(".wa-chat__model select")?.disabled).toBe(true);
    expect(q(".wa-chat__offline")?.textContent).toContain("Loading the model… 40%");
    adapter.set({ state: "ready" });
    await until(() => !q(".wa-chat__download"), 2000, "card gone");
    expect(q<HTMLSelectElement>(".wa-chat__model select")?.disabled).toBe(false);
  });
});
