/**
 * Redaction in the chat on a live page (design §8.3 rows 3, 9, 10): the tool card masks what the tool marks, the
 * person's own message is never altered, `hideFromModel` keeps a result field from the model and the stored history
 * while the page shows it, and restore leaves a sensitive field as it is.
 */
import { defineWebTool, installAgentVisuals, registerWebTool } from "@webmcp-agents/core";
import { configureRedaction } from "@webmcp-agents/core/redact";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../src/chat.css";
import { AgentChat } from "../src/components/AgentChat";
import { bindRestoreJournal, RestoreJournal, reverseToolCalls } from "../src/session/restore-journal";
import type { AgentAdapter, AgentRunRequest, AgentStreamPart } from "../src/types";
import { cleanupFixtures, fixture, modelContext, uniqueName, until } from "./browser-utils";

const PASSPORT = "A1234567";
const REFERENCE = "BR-777";
const EMAIL = "sara@example.com";
const CARD = "4242 4242 4242 4242";

const host = () => document.querySelector<HTMLElement>(".wa-chat")!;

function fakeAdapter(script: (req: AgentRunRequest) => AsyncGenerator<AgentStreamPart>): AgentAdapter & { requests: AgentRunRequest[] } {
  const adapter: AgentAdapter & { requests: AgentRunRequest[] } = {
    id: "fake",
    label: "Fake",
    requests: [],
    run(req) {
      // a copy: the session goes on appending to the array it passed
      adapter.requests.push({ ...req, messages: structuredClone(req.messages) });
      return script(req);
    },
  };
  return adapter;
}

describe("the chat's redaction", () => {
  const offs: Array<() => void> = [];
  beforeAll(() => modelContext());
  afterEach(() => {
    for (const off of offs.splice(0)) off();
    cleanupFixtures();
    sessionStorage.clear();
    configureRedaction({});
  });

  /** A booking tool: marks the passport, and keeps the booking reference from the model. */
  function bookingTool(): string {
    const id = uniqueName("book_trip");
    fixture('<p id="booking-ref"></p>');
    offs.push(
      registerWebTool(
        defineWebTool({
          id,
          description: "Book the trip.",
          inputSchema: { type: "object", properties: { passport: { type: "string" }, loyaltyId: { type: "string" } } },
          sensitive: { input: ["passport"], output: ["bookingReference"], hideFromModel: true },
          execute: () => {
            (document.getElementById("booking-ref") as HTMLElement).textContent = REFERENCE; // the page shows it
            return { bookingReference: REFERENCE, contact: EMAIL, seats: 2 };
          },
        }),
      ),
    );
    return id;
  }

  const script = (id: string, input: Record<string, unknown>) =>
    async function* (req: AgentRunRequest): AsyncGenerator<AgentStreamPart> {
      yield { type: "message-start", messageId: `a${req.messages.length}` };
      if (req.messages.length === 1) {
        yield { type: "tool-call", messageId: "a1", id: "c1", name: id, input };
        const output = await req.callTool({ id: "c1", name: id, input });
        yield { type: "tool-result", id: "c1", output };
      }
      yield { type: "text-delta", messageId: `a${req.messages.length}`, delta: "Booked." };
      yield { type: "finish", reason: "stop" };
    };

  it("the card masks marked fields and detected values; the person's own message is shown as typed", async () => {
    const id = bookingTool();
    const adapter = fakeAdapter(script(id, { passport: PASSPORT }));
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(host().querySelector("textarea")!, `my card is ${CARD}, book it{Enter}`);
    await until(() => host().querySelector(".wa-chat__tool")?.getAttribute("data-status") === "done", 4000, "card done");
    const card = host().querySelector(".wa-chat__tool")!.textContent ?? "";
    for (const secret of [PASSPORT, REFERENCE, EMAIL]) expect(card).not.toContain(secret);
    expect(host().querySelector('[data-role="user"]')?.textContent).toContain(`my card is ${CARD}`);
    expect(document.getElementById("booking-ref")?.textContent).toBe(REFERENCE);
  });

  it("hideFromModel: the next request and the stored history hold the token; other fields reach the model", async () => {
    const id = bookingTool();
    const storageKey = uniqueName("redaction-chat");
    const adapter = fakeAdapter(script(id, { passport: PASSPORT }));
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={storageKey} />);
    await userEvent.type(host().querySelector("textarea")!, "book it{Enter}");
    await until(() => adapter.requests.length === 1 && host().textContent!.includes("Booked."), 4000, "first run");
    await until(() => !host().querySelector("textarea")?.disabled, 4000, "idle");
    await userEvent.type(host().querySelector("textarea")!, "thanks{Enter}");
    await until(() => adapter.requests.length === 2, 4000, "second run");
    const sent = JSON.stringify(adapter.requests[1]!.messages);
    expect(sent).not.toContain(REFERENCE);
    expect(sent).toContain("[REDACTED]");
    expect(sent).toContain(EMAIL); // only the hidden field: the model keeps the rest
    expect(sent).toContain(PASSPORT); // tool inputs reach the model unchanged
    const stored = Object.values(sessionStorage).join("");
    expect(stored).not.toContain(REFERENCE);
  });

  it("the page's configured keys reach the card (one configuration, every sink)", async () => {
    configureRedaction({ keys: (d) => [...d, "loyaltyId"] });
    const id = bookingTool();
    const adapter = fakeAdapter(script(id, { loyaltyId: "L-99" }));
    await render(<AgentChat adapter={adapter} defaultOpen storageKey={false} />);
    await userEvent.type(host().querySelector("textarea")!, "book{Enter}");
    await until(() => host().querySelector(".wa-chat__tool")?.getAttribute("data-status") === "done", 4000, "card done");
    expect(host().querySelector(".wa-chat__tool")!.textContent).not.toContain("L-99");
  });
});

describe("restore and sensitive fields", () => {
  const offs: Array<() => void> = [];
  beforeAll(() => modelContext());
  afterEach(() => {
    for (const off of offs.splice(0)) off();
    cleanupFixtures();
  });

  it("the fill event carries no previous value for a sensitive field, so restore leaves it; other fields go back", async () => {
    const visuals = installAgentVisuals({ linger: 20, yieldToUser: false });
    offs.push(() => visuals.destroy());
    const id = uniqueName("save_card");
    fixture(
      '<form><input name="holder" aria-label="Holder" value="Old Name"><input name="card" aria-label="Card" autocomplete="cc-number" value="4000000000000002"><input name="passport" aria-label="Passport" value="OLD-P"><button type="button">Save card</button></form>',
    );
    offs.push(
      registerWebTool(
        defineWebTool({
          id,
          title: "Save card",
          description: "Save the card.",
          inputSchema: {
            type: "object",
            properties: { holder: { type: "string" }, card: { type: "string" }, passport: { type: "string" } },
          },
          sensitive: ["passport"],
          execute: () => "saved",
        }),
      ),
    );
    const journal = new RestoreJournal();
    offs.push(bindRestoreJournal(journal));
    journal.beginCall("c1", id);
    await modelContext().executeTool(id, { holder: "New Name", card: "4242424242424242", passport: "NEW-P" });
    journal.endCall("c1", id);
    const field = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    expect(field("card").value).toBe("4242424242424242");

    await reverseToolCalls(
      [{ type: "tool", id: "c1", name: id, input: {}, state: "done", output: { content: [{ type: "text", text: "saved" }] } }],
      journal,
    );
    expect(field("holder").value).toBe("Old Name");
    expect(field("card").value).toBe("4242424242424242"); // a sensitive control: left as it is
    expect(field("passport").value).toBe("NEW-P"); // a sensitive parameter: left as it is
  });
});
