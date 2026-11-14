import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmationUnavailableError, waitForConfirmation } from "./confirm";
import { cleanupFixtures, fixture, recordEvents } from "./test-utils";
import { UI_HOST_ATTR } from "./user-yield";

const timeout = (ms: number) => new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms));

describe("waitForConfirmation", () => {
  afterEach(cleanupFixtures);

  function button(): { el: HTMLButtonElement; onClick: ReturnType<typeof vi.fn> } {
    const el = fixture('<button type="button" toolname="t_confirm">Clear cart</button>').querySelector("button") as HTMLButtonElement;
    const onClick = vi.fn();
    el.addEventListener("click", onClick);
    return { el, onClick };
  }

  it("resolves on a trusted click and keeps it from the element's own handler", async () => {
    const { el, onClick } = button();
    const rec = recordEvents();
    const confirmed = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm");
    expect(rec.events).toEqual([{ type: "park", tool: "t_confirm", prompt: 'Click "Clear cart" to confirm' }]);
    rec.stop();
    await userEvent.click(el);
    await expect(confirmed).resolves.toBeUndefined();
    expect(onClick).not.toHaveBeenCalled();
    // Settled: later clicks reach the element again.
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalledOnce();
  });

  /**
   * What React Aria's usePress does (react-aria 3.53): after a pointerup on its element it waits 80 ms for the click,
   * watched by a capture listener on the document, and calls `el.click()` itself when none arrived.
   */
  function pressFallback(el: HTMLElement): void {
    el.addEventListener("pointerdown", () => {
      let clicked = false;
      const seen = (): void => {
        clicked = true;
      };
      document.addEventListener("click", seen, true);
      document.addEventListener(
        "pointerup",
        () =>
          setTimeout(() => {
            document.removeEventListener("click", seen, true);
            if (!clicked) el.click();
          }, 80),
        { once: true },
      );
    });
  }

  it("swallows the click a press library re-fires for the confirming click (React Aria)", async () => {
    const { el, onClick } = button();
    pressFallback(el);
    const confirmed = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm");
    await userEvent.click(el);
    await expect(confirmed).resolves.toBeUndefined();
    await timeout(200); // past the library's 80 ms
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps a re-fired click from following a link", async () => {
    const el = fixture('<a href="#t-confirm-followed" toolname="t_confirm_link">Open GitHub</a>').querySelector("a") as HTMLAnchorElement;
    pressFallback(el);
    const confirmed = waitForConfirmation('[toolname="t_confirm_link"]', new AbortController().signal, "t_confirm_link");
    await userEvent.click(el);
    await expect(confirmed).resolves.toBeUndefined();
    await timeout(200);
    expect(location.hash).not.toBe("#t-confirm-followed");
  });

  it("swallows the re-fired click when the tool's element is inside or around the library's", async () => {
    // React Aria drops unknown attributes, so `toolname` ends up on a child or a wrapper of its control.
    for (const html of [
      '<button type="button" class="press"><span toolname="t_confirm">Clear cart</span></button>',
      '<div toolname="t_confirm"><button type="button" class="press">Clear cart</button></div>',
    ]) {
      const el = fixture(html).querySelector(".press") as HTMLButtonElement;
      const onClick = vi.fn();
      el.addEventListener("click", onClick);
      pressFallback(el);
      const confirmed = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm");
      await userEvent.click(el);
      await expect(confirmed).resolves.toBeUndefined();
      await timeout(200);
      expect(onClick).not.toHaveBeenCalled();
      cleanupFixtures();
    }
  });

  it("swallows re-fired clicks on that element only, and only for a moment", async () => {
    const { el, onClick } = button();
    const other = fixture('<button type="button">Other</button>').querySelector("button") as HTMLButtonElement;
    const onOther = vi.fn();
    other.addEventListener("click", onOther);
    const confirmed = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm");
    await userEvent.click(el);
    await confirmed;
    other.click();
    expect(onOther).toHaveBeenCalledOnce();
    await timeout(400);
    el.click(); // the page's own scripted clicks work again
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("ignores a script's untrusted click", async () => {
    const { el } = button();
    const ac = new AbortController();
    const confirmed = waitForConfirmation('[toolname="t_confirm"]', ac.signal, "t_confirm").then(() => "confirmed");
    el.click();
    expect(await Promise.race([confirmed, timeout(100)])).toBe("timeout");
    ac.abort();
    await confirmed.catch(() => {});
  });

  it("is cancelled by a trusted click elsewhere on the page", async () => {
    button();
    const other = fixture('<button type="button">Other</button>').querySelector("button") as HTMLButtonElement;
    const confirmed = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm").catch((err) => err);
    await userEvent.click(other);
    expect(await confirmed).toMatchObject({ code: "cancelled", message: expect.stringMatching(/clicked elsewhere/) });
  });

  it("is cancelled when the person scrolls, but not by a scroll already under way", async () => {
    const { el } = button();
    await userEvent.hover(el);
    // Momentum from before the prompt: the gesture is already under way when the gate opens, inside its first wheel
    // event, so no round trip to the browser driver sits between them (a loaded runner took longer than the gesture
    // gap when the gate opened first). The rest come back-to-back in the same command.
    let confirmed!: Promise<string | undefined>;
    const opened = new Promise<void>((resolve) =>
      addEventListener(
        "wheel",
        () => {
          confirmed = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm").then(
            () => "confirmed",
            (err: { code?: string }) => err.code,
          );
          resolve();
        },
        { capture: true, once: true },
      ),
    );
    await userEvent.wheel(el, { delta: { y: 1 }, times: 4 });
    await opened;
    expect(await Promise.race([confirmed, timeout(50)])).toBe("timeout");
    await timeout(300); // the gesture ends
    await userEvent.wheel(el, { delta: { y: 1 } });
    expect(await confirmed).toBe("cancelled");
  });

  it("ignores clicks inside a library UI and a script's clicks elsewhere", async () => {
    button();
    const ui = fixture(`<div ${UI_HOST_ATTR}><button type="button">Chat</button></div>`).querySelector("button") as HTMLButtonElement;
    const other = fixture('<button type="button">Other</button>').querySelector("button") as HTMLButtonElement;
    const ac = new AbortController();
    const confirmed = waitForConfirmation('[toolname="t_confirm"]', ac.signal, "t_confirm").then(() => "confirmed");
    await userEvent.click(ui);
    other.click();
    other.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(await Promise.race([confirmed, timeout(100)])).toBe("timeout");
    ac.abort();
    await confirmed.catch(() => {});
  });

  it("rejects with an AbortError when the call is cancelled", async () => {
    button();
    const ac = new AbortController();
    const confirmed = waitForConfirmation('[toolname="t_confirm"]', ac.signal, "t_confirm");
    ac.abort();
    await expect(confirmed).rejects.toMatchObject({ name: "AbortError" });
  });

  it("fails closed when nothing clickable matches the selector", async () => {
    await expect(waitForConfirmation('[toolname="missing"]', new AbortController().signal, "missing")).rejects.toBeInstanceOf(
      ConfirmationUnavailableError,
    );
    const { el } = button();
    el.disabled = true;
    await expect(waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm")).rejects.toBeInstanceOf(
      ConfirmationUnavailableError,
    );
  });

  it("rejects when the element goes away or is disabled while waiting", async () => {
    const { el } = button();
    const removed = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm");
    el.remove();
    await expect(removed).rejects.toThrow(/nothing to confirm on/);

    const second = button();
    const disabled = waitForConfirmation('[toolname="t_confirm"]', new AbortController().signal, "t_confirm");
    second.el.disabled = true;
    await expect(disabled).rejects.toBeInstanceOf(ConfirmationUnavailableError);
  });
});
