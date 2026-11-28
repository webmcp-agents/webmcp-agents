/**
 * The cross-sink leak test (design §8.5, rows 2 to 8 of §8.3): one checkout with a card number, a password, an email in
 * the result, a passport the tool marks sensitive and a `?token=` in the page URL, with recording ON everywhere (the
 * worst case). The canaries appear in none of: the devtools store, `onAgentRun` events, browser spans, server spans,
 * relayed spans, the POST body's `page.url`, the console, and the tool card's DOM. (R-EXP-5, R-RED-1, R-RED-3, R-RED-4)
 */
import { AgentChat, createCloudAdapter, defineWebAgent } from "@webmcp-agents/chat";
import { defineWebTool, registerWebTool } from "@webmcp-agents/core";
import { createDevtoolsStore } from "@webmcp-agents/devtools";
import { expect, modelContext, test, uniqueName, until } from "@webmcp-agents/testing";
import { mockChatServer, text, toolCall } from "@webmcp-agents/testing/chat";
import { memoryExporter } from "@webmcp-agents/testing/telemetry";
import { afterEach, beforeAll, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { observeAgents } from "../src";
import { defineObservability } from "../src/server";

const CANARY = {
  card: "4242 4242 4242 4242",
  password: "hunter2-canary",
  email: "canary.person@example.com",
  passport: "A1234567",
  token: "tok-canary-9f8e7d",
};
const CANARIES = Object.values(CANARY);
/** The card's digits in any spacing. */
const CARD_DIGITS = /4242\s?4242\s?4242\s?4242/;

/** The runner's own URL (it carries the session): put back after the test. */
const original = location.href;
beforeAll(() => modelContext());
afterEach(() => {
  history.replaceState(null, "", original);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the canary strings appear in no sink (§8.5)", async ({ runs, spans }) => {
  history.replaceState(null, "", `/checkout?token=${CANARY.token}&step=pay`);
  const console_ = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level));

  // ---------- the page: a checkout tool that marks the passport, a password parameter, an email in its result ----------
  const checkout = defineWebTool({
    id: uniqueName("checkout"),
    description: "Pay for the cart.",
    inputSchema: {
      type: "object",
      properties: { passport: { type: "string" }, card: { type: "string" }, password: { type: "string", format: "password" } },
    },
    sensitive: ["passport"],
    execute: () => ({ status: "paid", receipt: `Sent to ${CANARY.email}` }),
  });
  const off = registerWebTool(checkout);
  const store = createDevtoolsStore({ storageKey: uniqueName("devtools") });

  // ---------- the server: the chat handler and the relay share one layer, recording everything ----------
  const server = memoryExporter();
  const observability = defineObservability({ exporters: [server], recordInputs: true, recordOutputs: true, env: {} });
  // called in-process, the request never goes over the network, so it has no Origin (a script cannot set one)
  const relay = observability.relay({ allowMissingOrigin: true });
  const shopper = defineWebAgent({ id: "shopper", instructions: "Shop.", tools: [checkout] });
  const chat = mockChatServer({
    steps: [toolCall(checkout.id, { passport: CANARY.passport, card: CANARY.card, password: CANARY.password }), text("Paid.")],
    handler: { agents: [shopper], observability, telemetry: { recordInputs: true, recordOutputs: true } },
  });
  // the page's fetch: /api/telemetry reaches the relay in-process; anything else (the test runner's own) goes out
  const relayed: Request[] = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) !== "/api/telemetry") return realFetch(url, init);
    const req = new Request(new URL(String(url), location.href), init);
    relayed.push(req.clone());
    return relay(req);
  });
  const stop = observeAgents({ recordInputs: true, recordOutputs: true, batchSize: 1 });

  try {
    // ---------- the person types a card number and an email, the agent pays ----------
    const screen = await render(
      <AgentChat adapter={createCloudAdapter({ fetch: chat.fetch })} agent={shopper} defaultOpen storageKey={false} />,
    );
    const host = () => document.querySelector<HTMLElement>(".wa-chat")!;
    // the composer stays disabled until the cloud adapter's first request answers: typed before that, the message is
    // lost and no run starts (seen under a full `pnpm check`, where that request is slow)
    await until(() => host()?.querySelector("textarea")?.disabled === false, 30_000, "the composer");
    await userEvent.type(host().querySelector("textarea")!, `Pay with ${CANARY.card}, receipt to ${CANARY.email}{Enter}`);
    // the first run loads the OpenTelemetry packages cold: ~1 s alone, several under a full `pnpm check`
    await until(() => host().textContent?.includes("Paid.") ?? false, 30_000, "the answer");
    await until(() => runs.types().includes("run-finish"), 4000, "the run's end");
    await stop.flush();
    await observability.flush();

    // ---------- every sink ----------
    expect(server.spans.length).toBeGreaterThan(0);
    expect(spans.spans.length).toBeGreaterThan(0);
    expect(relayed.length).toBeGreaterThan(0);
    const relayedSpans = server.spans.filter((s) => s.scope === "@webmcp-agents/telemetry" && !s.name.startsWith("chat "));
    expect(relayedSpans.map((s) => s.name)).toContain("invoke_agent shopper");

    expect(store.getSnapshot()).not.toContainSensitive([...CANARIES, CARD_DIGITS]); // devtools store (row 2)
    expect(runs).not.toContainSensitive([...CANARIES, CARD_DIGITS]); // onAgentRun events (row 4)
    expect(spans).not.toContainSensitive([...CANARIES, CARD_DIGITS]); // browser spans (row 5)
    expect(server).not.toContainSensitive([...CANARIES, CARD_DIGITS]); // server and relayed spans (row 5)
    for (const req of relayed)
      expect(await req.text()).not.toMatch(new RegExp([...CANARIES.map((c) => c.replace(/[.]/g, "\\.")), CARD_DIGITS.source].join("|")));
    const pageUrls = chat.requests.map((r) => (r.body?.page as { url?: string } | undefined)?.url ?? "");
    expect(pageUrls.length).toBeGreaterThan(0);
    for (const url of pageUrls) expect(url).not.toContain(CANARY.token); // page.url in the POST body (row 6)
    for (const spy of console_) expect(spy).not.toContainSensitive([...CANARIES, CARD_DIGITS]); // console (row 7)
    const card = host().querySelector(".wa-chat__tool")!.textContent ?? ""; // the tool card (row 3)
    for (const secret of [CANARY.passport, CANARY.password, CANARY.email]) expect(card).not.toContain(secret);
    expect(card).not.toMatch(CARD_DIGITS);
    // what the page needs still works: the tool ran with the real values, and the model got them (row 9)
    expect(JSON.stringify(chat.requests.at(-1)?.body?.messages)).toContain(CANARY.passport);
    await screen.unmount();
  } finally {
    stop();
    store.destroy();
    off();
  }
}, 60_000);
