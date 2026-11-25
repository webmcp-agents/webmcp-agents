/** Page helpers for browser-mode tests: markup in, text out. */

/** The class every {@link fixture} root carries, so cleanup finds them. */
export const FIXTURE_CLASS = "test-fixture";

/**
 * Put `html` into the page and return its root (a `div.test-fixture` appended to `<body>`). `./setup` removes every
 * fixture after each test; without it, call {@link cleanupFixtures}.
 *
 * @example
 * const root = fixture('<form toolname="add_to_cart" tooldescription="Add mugs"><input name="qty"></form>');
 */
export function fixture(html: string): HTMLElement {
  if (typeof document === "undefined") throw new Error("fixture() needs a page: run this test in browser mode (a *.browser.test file).");
  const root = document.createElement("div");
  root.className = FIXTURE_CLASS;
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

/** Remove every {@link fixture} root from the page. */
export function cleanupFixtures(): void {
  if (typeof document === "undefined") return;
  for (const el of document.querySelectorAll(`.${FIXTURE_CLASS}`)) el.remove();
}

/** True while the agent cursor is shown (`.agent-cursor.is-visible`). */
export const cursorVisible = (): boolean => typeof document !== "undefined" && !!document.querySelector(".agent-cursor.is-visible");

/**
 * The shadow root of a library UI host (`[data-web-agents-ui="<name>"]`): `"devtools"` for the devtools panel.
 * Throws a sentence when it is not mounted.
 */
export function uiRoot(name: string): ShadowRoot {
  const root = document.querySelector(`[data-web-agents-ui="${name}"]`)?.shadowRoot;
  if (!root) throw new Error(`No [data-web-agents-ui="${name}"] host with an open shadow root is mounted.`);
  return root;
}

/** The first element under `root` matching `selector` whose text includes `text`, or null. */
export function byText<T extends Element = HTMLElement>(root: ParentNode, selector: string, text: string): T | null {
  return ([...root.querySelectorAll<T>(selector)].find((el) => el.textContent?.includes(text)) as T | undefined) ?? null;
}

/** All the text under `node` (default `<body>`), open shadow roots included. */
export function deepText(node: Node = document.body): string {
  let text = "";
  const walk = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
    if (n instanceof Element && n.shadowRoot) walk(n.shadowRoot);
    for (const child of n.childNodes) walk(child);
  };
  walk(node);
  return text;
}
