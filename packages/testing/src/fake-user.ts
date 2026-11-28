/**
 * The person at the page, as trusted input. The agent cursor yields to the person and a confirmation goes on only for
 * them: both look at `isTrusted`, which only real input (here, Playwright through `vitest/browser`) has.
 */

/** Where an action lands: an element, or something with an `element()` (a `vitest/browser` locator). */
export type UserTarget = Element | { element(): Element };

/** Trusted input in a browser-mode test. The `user` fixture is one. */
export interface FakeUser {
  /**
   * Click the control a confirmation waits on: the element the cursor parked on (`[data-agent-active]`), or the button
   * or link named `name`. Throws a sentence when nothing is waiting.
   */
  confirm(name?: string): Promise<void>;
  /** Move on: a trusted click away from every control (the top-left corner), which cancels a waiting confirmation. */
  moveOn(): Promise<void>;
  /** Scroll the page with the mouse wheel (default 200 px down). */
  scroll(deltaY?: number): Promise<void>;
  /** Click `target`. */
  click(target: UserTarget): Promise<void>;
  /** Type `text` into `target`, key by key (`{Enter}` presses Enter). */
  type(target: UserTarget, text: string): Promise<void>;
}

type BrowserContext = typeof import("vitest/browser");

const elementOf = (target: UserTarget): Element => (target instanceof Element ? target : target.element());

/** The accessible name of a button or link, near enough: aria-label, else its text. */
const nameOf = (el: Element): string => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();

/** Build a {@link FakeUser} on `vitest/browser`'s `userEvent`. Browser mode only. */
export async function fakeUser(): Promise<FakeUser> {
  let context: BrowserContext;
  try {
    context = await import("vitest/browser");
  } catch (err) {
    throw new Error('The user fixture needs browser mode: name the file *.browser.test.* (webAgentsProject("browser")).', { cause: err });
  }
  const { userEvent } = context;
  return {
    async confirm(name) {
      const controls = [...document.querySelectorAll("button, a[href], [role=button], input[type=submit]")];
      const el = name
        ? (controls.find((c) => nameOf(c) === name) ?? controls.find((c) => nameOf(c).startsWith(name)))
        : document.querySelector("[data-agent-active]");
      if (!el) {
        throw new Error(
          name
            ? `user.confirm("${name}"): no button or link named "${name}" is on the page.`
            : "user.confirm(): no control is waiting for the person (nothing has [data-agent-active]).",
        );
      }
      await userEvent.click(el);
    },
    async moveOn() {
      // a spot that is no control: a pointerdown there is the person moving on
      const spot = document.createElement("div");
      spot.setAttribute("aria-hidden", "true");
      spot.style.cssText = "position:fixed;left:0;top:0;width:8px;height:8px;z-index:2147483647";
      document.body.append(spot);
      try {
        await userEvent.click(spot);
      } finally {
        spot.remove();
      }
    },
    async scroll(deltaY = 200) {
      await userEvent.wheel(document.body, { delta: { y: deltaY } });
    },
    async click(target) {
      await userEvent.click(elementOf(target));
    },
    async type(target, text) {
      await userEvent.type(elementOf(target), text);
    },
  };
}
