import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AgentChat } from "../src/components/AgentChat";
import { toolsSettled } from "../src/session/run-agent";
import type { AgentMessage, AgentRunRequest } from "../src/types";
import { modelContext, uniqueName, until } from "@webmcp-agents/testing";
import { mockAdapter } from "@webmcp-agents/testing/chat";

/**
 * One storage key per test. A run that is still winding down when its test ends saves its conversation once more
 * (the end-of-run page stamp), after `afterEach` cleared the storage and before the component is unmounted: with a
 * shared key the next test would load that conversation.
 */
let KEY = "";
const host = () => document.querySelector<HTMLElement>(".wa-chat")!;
const textarea = () => host().querySelector<HTMLTextAreaElement>("textarea")!;
const stored = (): AgentMessage[] => JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as AgentMessage[];
const firstText = (req: Pick<AgentRunRequest, "messages"> | undefined): string => {
  const part = req?.messages.at(-1)?.parts[0];
  return part?.type === "text" ? part.text : "";
};

describe("useAgentSession: page moves between turns", () => {
  const start = location.pathname + location.search;
  beforeAll(() => modelContext());
  beforeEach(() => {
    KEY = uniqueName("page-moves");
  });
  afterEach(() => {
    history.replaceState(null, "", start);
    sessionStorage.clear();
  });

  it("tells the model when the person changed the page (query included) between turns", async () => {
    const adapter = mockAdapter(async function* (_req, { run: n }) {
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
    // let the second run finish (its end stamp) before the test ends: nothing of this test is then left in flight
    await until(() => stored().at(-1)?.page === "/results?from=JFK", 3000, "the second run's end stamp");
  });

  it("a stopped run that winds down after a newer one started does not stamp the newer turn", async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => {
      release = r;
    });
    let run1Returned!: () => void;
    const returned = new Promise<void>((r) => {
      run1Returned = r;
    });
    const adapter = mockAdapter(async function* (req, { run: n }) {
      yield { type: "message-start", messageId: `a${n}` };
      yield { type: "text-delta", messageId: `a${n}`, delta: n === 1 ? "first" : "second" };
      // run 1 ignores Stop until released; run 2 streams until it is stopped
      if (n === 1) {
        await released;
        run1Returned();
      } else await new Promise((r) => req.signal.addEventListener("abort", r, { once: true }));
    });
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={KEY} />);
    await userEvent.type(textarea(), "one{Enter}");
    await until(() => stored().some((m) => m.role === "assistant"));
    host().querySelector<HTMLButtonElement>('[aria-label="Stop"]')!.click();

    await userEvent.type(textarea(), "two{Enter}");
    await until(() => stored().filter((m) => m.role === "assistant").length === 2, 3000, "run 2's reply");
    history.replaceState(null, "", "/moved");
    release();
    // Wait on what happened, not on a clock: run 1 returned, and the page then stayed quiet for longer than the quiet
    // period the session itself waits (150 ms) before it would stamp, so by now it has decided not to.
    await returned;
    await toolsSettled(400);
    expect(stored().at(-1)).toMatchObject({ role: "assistant" });
    expect(stored().at(-1)?.page).toBeUndefined();
    host().querySelector<HTMLButtonElement>('[aria-label="Stop"]')!.click();
  });
});
