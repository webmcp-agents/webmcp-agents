import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AgentChat } from "../src/components/AgentChat";
import type { AgentAdapter, AgentMessage, AgentRunRequest, AgentStreamPart } from "../src/types";
import { modelContext, until } from "./browser-utils";

const KEY = "page-moves-test";
const host = () => document.querySelector<HTMLElement>(".wa-chat")!;
const textarea = () => host().querySelector<HTMLTextAreaElement>("textarea")!;
const stored = (): AgentMessage[] => JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as AgentMessage[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstText = (req: AgentRunRequest | undefined): string => {
  const part = req?.messages.at(-1)?.parts[0];
  return part?.type === "text" ? part.text : "";
};

function fakeAdapter(
  script: (req: AgentRunRequest, n: number) => AsyncGenerator<AgentStreamPart>,
): AgentAdapter & { requests: AgentRunRequest[] } {
  const adapter: AgentAdapter & { requests: AgentRunRequest[] } = {
    id: "fake",
    label: "Fake",
    requests: [],
    run(req) {
      adapter.requests.push(req);
      return script(req, adapter.requests.length);
    },
  };
  return adapter;
}

describe("useAgentSession: page moves between turns", () => {
  const start = location.pathname + location.search;
  beforeAll(() => modelContext());
  afterEach(() => {
    history.replaceState(null, "", start);
    sessionStorage.clear();
  });

  it("tells the model when the person changed the page (query included) between turns", async () => {
    const adapter = fakeAdapter(async function* (_req, n) {
      yield { type: "message-start", messageId: `a${n}` };
      yield { type: "text-delta", messageId: `a${n}`, delta: "ok" };
      yield { type: "finish", reason: "stop" };
    });
    history.replaceState(null, "", "/results?from=CAI");
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={KEY} />);
    await userEvent.type(textarea(), "find flights{Enter}");
    await until(
      () => {
        const last = stored().at(-1);
        return last?.role === "assistant" && last.page === "/results?from=CAI";
      },
      3000,
      "the run's end stamp",
    );

    history.replaceState(null, "", "/results?from=JFK");
    await userEvent.type(textarea(), "book the cheapest{Enter}");
    await until(() => adapter.requests.length === 2);
    expect(firstText(adapter.requests[1])).toContain('from the page "/results?from=CAI" to "/results?from=JFK"');
  });

  it("a stopped run that winds down after a newer one started does not stamp the newer turn", async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => {
      release = r;
    });
    const adapter = fakeAdapter(async function* (req, n) {
      yield { type: "message-start", messageId: `a${n}` };
      yield { type: "text-delta", messageId: `a${n}`, delta: n === 1 ? "first" : "second" };
      // run 1 ignores Stop until released; run 2 streams until it is stopped
      if (n === 1) await released;
      else await new Promise((r) => req.signal.addEventListener("abort", r, { once: true }));
    });
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={KEY} />);
    await userEvent.type(textarea(), "one{Enter}");
    await until(() => stored().some((m) => m.role === "assistant"));
    host().querySelector<HTMLButtonElement>('[aria-label="Stop"]')!.click();

    await userEvent.type(textarea(), "two{Enter}");
    await until(() => stored().filter((m) => m.role === "assistant").length === 2, 3000, "run 2's reply");
    history.replaceState(null, "", "/moved");
    release();
    await sleep(500); // run 1 returns, then waits for the page to settle before it would stamp
    expect(stored().at(-1)).toMatchObject({ role: "assistant" });
    expect(stored().at(-1)?.page).toBeUndefined();
    host().querySelector<HTMLButtonElement>('[aria-label="Stop"]')!.click();
  });
});
