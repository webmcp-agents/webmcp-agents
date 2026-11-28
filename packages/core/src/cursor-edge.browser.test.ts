/**
 * Where the cursor is when a call acts, and where it is left afterwards: a control outside the viewport, a pinned
 * one (a sticky header), a control that gets covered or hidden, a call the person is not watching (a busy pointer, a
 * background tab), and a confirmation whose control changes while it waits.
 */
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentCursor } from "./cursor";
import { locate } from "./locate";
import { cleanupFixtures, cursorVisible, fixture, modelContext, recordEvents, resultText, uniqueName, until } from "@webmcp-agents/testing";
import { toolErrorCode } from "./result";
import { type AgentVisuals, installAgentVisuals } from "./visuals";
import { defineWebTool, registerWebTool, type WebToolConfig } from "./web-tool";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const byId = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** True when `el` is wholly inside the viewport. */
const inViewport = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
};

/** The cursor's tip in viewport px, read from the transform it is drawn with (the arrow's tip is 4 px in). */
const tip = (): { x: number; y: number } => {
  const m = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(document.querySelector<HTMLElement>(".agent-cursor")?.style.transform ?? "");
  return { x: Number(m?.[1]) + 4, y: Number(m?.[2]) + 4 };
};

describe("the cursor at the edges", () => {
  let visuals: AgentVisuals | null = null;
  let rec: ReturnType<typeof recordEvents>;
  const offs: Array<() => void> = [];

  function tool(config: Omit<WebToolConfig<unknown, unknown>, "description">): void {
    offs.push(registerWebTool(defineWebTool({ description: "test tool", ...config })));
  }
  const call = (id: string, args: Record<string, unknown> = {}) => modelContext().executeTool(id, args) as Promise<ModelContextToolResult>;
  const install = (options: Parameters<typeof installAgentVisuals>[0] = {}): void => {
    visuals = installAgentVisuals({ linger: 50, yieldToUser: false, ...options });
  };

  beforeEach(() => {
    modelContext();
    rec = recordEvents();
  });

  afterEach(() => {
    for (const off of offs.splice(0)) off();
    rec.stop();
    visuals?.destroy();
    visuals = null;
    cleanupFixtures();
    vi.restoreAllMocks();
    scrollTo(0, 0);
  });

  // ---------- a control outside the viewport ----------

  it("presses a control far down the page only once it has scrolled into view, the hand on it", async () => {
    install();
    const id = uniqueName("t_far");
    fixture('<div style="height:3000px"></div><button id="far" type="button">Far away</button><div style="height:600px"></div>');
    let seen: { control: boolean; hand: boolean } | undefined;
    tool({
      id,
      title: "Far away",
      execute: () => {
        const r = byId("far").getBoundingClientRect();
        const { x, y } = tip();
        seen = { control: inViewport(byId("far")), hand: x >= r.left && x <= r.right && y >= r.top && y <= r.bottom };
      },
    });
    const pending = call(id);
    // while the page scrolls, the hand waits inside the viewport instead of at the target, out of sight
    await until(() => cursorVisible() && !Number.isNaN(tip().y), 2000, "the cursor, drawn");
    expect(tip().y).toBeLessThanOrEqual(innerHeight);
    expect(tip().y).toBeGreaterThanOrEqual(0);
    await pending;
    expect(seen).toEqual({ control: true, hand: true });
  });

  it("leaves the page where it is for a control in a sticky header", async () => {
    install();
    const id = uniqueName("t_sticky");
    fixture(
      '<header style="position:sticky;top:0;height:40px;background:#fff"><button id="menu" type="button">Open menu</button></header>' +
        '<div style="height:3000px"></div>',
    );
    scrollTo(0, 900);
    await sleep(50);
    // where the page is, not 900: a CI runner's scroll can land a pixel off. Scrolling the control to the middle would
    // move hundreds of pixels, so a pixel of slack keeps the point.
    const start = scrollY;
    let pressedAt = -1;
    tool({
      id,
      title: "Open menu",
      execute() {
        pressedAt = scrollY;
      },
    });
    await call(id);
    await sleep(400); // a smooth scroll would still be under way
    expect(Math.abs(pressedAt - start)).toBeLessThanOrEqual(1);
    expect(Math.abs(scrollY - start)).toBeLessThanOrEqual(1);
  });

  // ---------- after the press ----------

  it("leaves at once when the page covers the control it pressed (a drawer opening over it)", async () => {
    install({ linger: 5000 });
    const id = uniqueName("t_cover");
    const root = fixture('<button id="open" type="button" style="margin:60px">Open drawer</button>');
    tool({
      id,
      title: "Open drawer",
      execute: () => {
        root.insertAdjacentHTML("beforeend", '<div id="drawer" style="position:fixed;inset:0;background:#fff"></div>');
      },
    });
    await call(id);
    expect(cursorVisible()).toBe(true); // pressed in sight
    await until(() => !cursorVisible(), 1000, "the cursor to leave the covered control");
  });

  it("leaves when the control it pressed moves away or is removed, and stays on one that holds still", async () => {
    install({ linger: 5000 });
    const [moves, goes, stays] = [uniqueName("t_moves"), uniqueName("t_goes"), uniqueName("t_stays")];
    const root = fixture(
      '<div id="spacer"></div><button id="b-moves" type="button">Shift the list</button>' +
        '<button id="b-goes" type="button">Remove me</button><button id="b-stays" type="button">Stay put</button>',
    );
    root.style.margin = "60px";
    tool({
      id: moves,
      title: "Shift the list",
      execute() {
        byId("spacer").style.height = "200px";
      },
    });
    tool({ id: goes, title: "Remove me", execute: () => byId("b-goes").remove() });
    tool({ id: stays, title: "Stay put", execute: () => "ok" });

    await call(moves);
    await until(() => !cursorVisible(), 1000, "the cursor to leave the control that moved");
    await call(goes);
    await until(() => !cursorVisible(), 1000, "the cursor to leave the control that was removed");
    await call(stays);
    await sleep(700);
    expect(cursorVisible()).toBe(true);
  });

  it("holds its place when the control it is heading for is hidden, instead of flying to the page's corner", async () => {
    install();
    const button = fixture('<button id="gone" type="button" style="margin:200px 0 0 200px">Hide me</button>').querySelector("button");
    const move = agentCursor.moveTo(button as Element);
    await sleep(60);
    (button as HTMLElement).style.display = "none";
    await move;
    await sleep(200);
    expect(tip().x).toBeGreaterThan(100);
    expect(tip().y).toBeGreaterThan(100);
  });

  // ---------- nobody is watching ----------

  it("runs at once in a background tab, where no frame is drawn", async () => {
    install();
    const id = uniqueName("t_hidden");
    fixture('<button type="button">Run in the background</button>');
    tool({ id, title: "Run in the background", execute: () => "done" });
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const started = performance.now();
    expect(resultText(await call(id))).toBe("done");
    expect(performance.now() - started).toBeLessThan(300);
    expect(cursorVisible()).toBe(false);
  });

  it("finishes a move by timer when frames stop mid-flight", async () => {
    install();
    const button = fixture('<button type="button" style="margin:300px 0 0 200px">Far</button>').querySelector("button") as Element;
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1); // a pane that draws nothing
    let arrived = false;
    void agentCursor.moveTo(button).then(() => (arrived = true));
    await sleep(500);
    expect(arrived).toBe(false);
    await vi.waitFor(() => expect(arrived).toBe(true), { timeout: 5000 });
  }, 8000);

  it("rings the control a call pressed while the person was busy, then lets go", async () => {
    install({ yieldToUser: { resumeAfter: 3000 } });
    const id = uniqueName("t_busy");
    const root = fixture('<div id="pad" style="height:80px"></div><button id="busy" type="button">Do it</button>');
    tool({ id, title: "Do it", execute: () => "done" });
    await userEvent.click(root.querySelector("#pad") as Element); // the person is using the page
    await until(() => rec.types().includes("yield"), 1000, "yield");
    expect(resultText(await call(id))).toBe("done");
    expect(cursorVisible()).toBe(false);
    expect(document.querySelector(".agent-ring.is-visible")).not.toBeNull();
    await until(() => !document.querySelector(".agent-ring.is-visible"), 2000, "the ring to go");
  });

  it("drops that ring at once when the press covered the control", async () => {
    install({ yieldToUser: { resumeAfter: 3000 }, linger: 5000 });
    const id = uniqueName("t_busy_cover");
    const root = fixture('<div id="pad2" style="height:80px"></div><button type="button">Open the sheet</button>');
    tool({
      id,
      title: "Open the sheet",
      execute: () => {
        root.insertAdjacentHTML("beforeend", '<div style="position:fixed;inset:0;background:#fff"></div>');
      },
    });
    await userEvent.click(root.querySelector("#pad2") as Element);
    await until(() => rec.types().includes("yield"), 1000, "yield");
    await call(id);
    await until(() => !document.querySelector(".agent-ring.is-visible"), 400, "the ring to go from the covered control");
  });

  // ---------- a confirmation whose control changes while it waits ----------

  it("moves a parked confirmation to the control that replaces a hidden one, and the click there confirms", async () => {
    install();
    const id = uniqueName("t_fold");
    fixture(
      '<header><a id="top" href="#x">Source</a></header><div style="height:120px"></div><footer><a id="bottom" href="#x">Source</a></footer>',
    );
    let executed = 0;
    tool({
      id,
      requireConfirmation: true,
      // the header's link, or the footer's once the header folds it away
      target: () => locate({ role: "link", name: "Source", within: "header" }) ?? { role: "link", name: "Source", within: "footer" },
      execute: () => {
        executed++;
        return "opened";
      },
    });
    const pending = call(id);
    await until(() => byId("top").hasAttribute("data-agent-active"), 3000, "parked on the header link");
    byId("top").style.display = "none"; // what a container query does: no mutation of the tree
    await until(() => byId("bottom").hasAttribute("data-agent-active"), 2000, "parked on the footer link");
    expect(byId("top").hasAttribute("data-agent-active")).toBe(false);
    expect(document.querySelector(".agent-cursor.is-waiting")).not.toBeNull();
    expect(executed).toBe(0);
    await userEvent.click(byId("bottom"));
    expect(resultText(await pending)).toBe("opened");
    expect(executed).toBe(1);
  });

  /** A waiting "Pay now" confirmation and another tool, "Switch theme". */
  function waitingAndOther(): { waits: string; other: string; paid: () => number; waitingLook: () => boolean | undefined } {
    const [waits, other] = [uniqueName("t_waits"), uniqueName("t_other")];
    fixture(
      '<div id="chip" style="height:30px">chip</div><button id="pay" type="button" style="margin:40px">Pay now</button>' +
        '<div style="height:200px"></div><button id="theme" type="button" style="margin:40px">Switch theme</button>',
    );
    let paid = 0;
    let look: boolean | undefined;
    tool({ id: waits, title: "Pay now", requireConfirmation: true, execute: () => void paid++ });
    tool({
      id: other,
      title: "Switch theme",
      execute: () => {
        // pressing another control, the hand must not still say "Click Pay now to confirm"
        look = !!document.querySelector(".agent-cursor.is-waiting");
        return "switched";
      },
    });
    return { waits, other, paid: () => paid, waitingLook: () => look };
  }

  it("an agent's next call leaves a waiting confirmation waiting, and the cursor returns to it", async () => {
    install();
    const t = waitingAndOther();
    const pending = call(t.waits);
    await until(() => !!document.querySelector(".agent-cursor.is-waiting"), 3000, "parked");
    expect(resultText(await call(t.other))).toBe("switched");
    expect(t.waitingLook()).toBe(false);
    // back on the control that still waits, prompt and ring with it
    const onPay = (): boolean => {
      const r = byId("pay").getBoundingClientRect();
      const { x, y } = tip();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    await until(() => !!document.querySelector(".agent-cursor.is-waiting.is-visible") && onPay(), 3000, "the cursor back on it");
    expect(document.querySelector(".agent-tag")?.textContent).toBe('Click "Pay now" to confirm');
    expect(document.querySelector(".agent-ring.is-visible")).not.toBeNull();
    await userEvent.click(byId("pay"));
    await pending;
    expect(t.paid()).toBe(1);
  });

  it("a call the person starts themself cancels a waiting confirmation, and its prompt goes", async () => {
    install();
    const t = waitingAndOther();
    const pending = call(t.waits);
    await until(() => !!document.querySelector(".agent-cursor.is-waiting"), 3000, "parked");
    await userEvent.click(byId("chip")); // the person presses something that runs a tool: a chip, the devtools' Run
    expect(resultText(await call(t.other))).toBe("switched");
    const cancelled = await pending;
    expect(toolErrorCode(cancelled)).toBe("cancelled");
    expect(resultText(cancelled)).toContain(`the user ran "${t.other}" instead`);
    expect(byId("pay").hasAttribute("data-agent-active")).toBe(false);
    await until(() => !document.querySelector(".agent-cursor.is-waiting"), 1000, "the prompt to go");
    // the click that would have confirmed is the page's own again
    let clicks = 0;
    byId("pay").addEventListener("click", () => clicks++);
    await userEvent.click(byId("pay"));
    expect(clicks).toBe(1);
    expect(t.paid()).toBe(0);
  });

  it("a confirmation nobody answers gives up after 10 s with needs_user", async () => {
    install();
    const t = waitingAndOther();
    const started = performance.now();
    const result = await call(t.waits);
    expect(performance.now() - started).toBeGreaterThan(9500);
    expect(toolErrorCode(result)).toBe("needs_user");
    expect(resultText(result)).toContain("did not confirm");
    expect(t.paid()).toBe(0);
    await until(() => !document.querySelector(".agent-cursor.is-waiting"), 1000, "unparked");
  }, 15_000);

  it("fails a parked confirmation, rather than wait for ever, once CSS hides its only control", async () => {
    install();
    const id = uniqueName("t_hide");
    fixture('<button id="only" type="button">Delete everything</button>');
    let executed = 0;
    tool({ id, title: "Delete everything", requireConfirmation: true, execute: () => void executed++ });
    const pending = call(id);
    await until(() => rec.types().includes("park"), 3000, "park");
    byId("only").style.display = "none";
    const result = await pending;
    expect(toolErrorCode(result)).toBe("unavailable");
    expect(executed).toBe(0);
    await until(() => !document.querySelector(".agent-cursor.is-waiting"), 1000, "unparked");
  });

  it("returns to a parked control once the person goes quiet, scrolling to one they were never shown", async () => {
    install({ yieldToUser: { resumeAfter: 150 } });
    const id = uniqueName("t_back");
    const root = fixture(
      '<div id="pad" style="height:80px"></div><div style="height:2500px"></div><button id="confirm" type="button">Pay now</button><div style="height:400px"></div>',
    );
    tool({ id, title: "Pay now", requireConfirmation: true, execute: () => "paid" });
    await userEvent.click(root.querySelector("#pad") as Element); // busy when the call starts: nothing may scroll yet
    await until(() => rec.types().includes("yield"), 1000, "yield");
    const pending = call(id);
    await until(() => rec.types().includes("park"), 2000, "park");
    expect(scrollY).toBe(0);
    await until(() => inViewport(byId("confirm")) && cursorVisible(), 4000, "the control scrolled to and the cursor on it");
    expect(document.querySelector(".agent-cursor.is-waiting")).not.toBeNull();
    await userEvent.click(byId("confirm"));
    expect(resultText(await pending)).toBe("paid");
  }, 10_000);
});
