import type { MatcherResult, MatcherState } from "vitest";
import { hint, MatcherInputError, show } from "../format";
import { SENTINEL } from "../sentinel";

/** Options for {@link toHaveNoHardcodedText}. */
export interface NoHardcodedTextOptions {
  /**
   * Text that is allowed although it is not a marker: what the person typed, what the model or a tool answered, an
   * adapter's own name. A string is removed wherever it appears; a RegExp (use the `g` flag) likewise.
   */
  allow?: readonly (string | RegExp)[];
}

/** Attributes a person (or their screen reader) reads. */
const READ_ATTRIBUTES = ["aria-label", "placeholder", "title", "alt", "aria-valuetext", "aria-roledescription", "aria-description"];
/** Elements whose text is not shown: styles, scripts, and the drawing inside an icon. */
const SKIP = "style, script, template, svg";

/** Any letter, in any script: digits and punctuation around markers are not words. */
const LETTER = /\p{L}/u;

function rootOf(received: unknown): Element {
  const host = (received as { host?: unknown } | null)?.host ?? received;
  if (typeof Element !== "undefined" && host instanceof Element) return host;
  throw new MatcherInputError(
    `toHaveNoHardcodedText reads a rendered chat (what renderChat() returns) or an element, but got ${show(received)}.`,
  );
}

const where = (el: Element): string => {
  const part = el.closest("[data-wa-part]")?.getAttribute("data-wa-part");
  return `<${el.tagName.toLowerCase()}${part ? ` data-wa-part="${part}"` : ""}>`;
};

/** What is left of `text` once markers and allowed text are taken out. */
function stray(text: string, allow: readonly (string | RegExp)[]): string {
  let rest = text.replace(SENTINEL, " ");
  for (const a of allow) rest = typeof a === "string" ? rest.split(a).join(" ") : rest.replace(a, " ");
  return rest.replace(/\s+/g, " ").trim();
}

/**
 * The rendered chat shows no text that bypassed its messages catalog: render it with the sentinel catalog
 * (`renderChat({ sentinel: true })`), and every text node and every `aria-label`, `placeholder`, `title`, `alt` and
 * `aria-valuetext` holds only `⟦markers⟧`, punctuation, digits, or text you `allow` (the person's and the model's own
 * words). Fails with each stray string and where it is.
 *
 * @example
 * const chat = await renderChat({ adapter, sentinel: true });
 * await expect(chat).toHaveNoHardcodedText({ allow: ["Add a mug", "Added."] });
 */
export function toHaveNoHardcodedText(this: MatcherState, received: unknown, options: NoHardcodedTextOptions = {}): MatcherResult {
  const root = rootOf(received);
  const allow = options.allow ?? [];
  const found: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP)) continue;
    const left = stray(node.textContent ?? "", allow);
    if (LETTER.test(left)) found.push(`text ${show(left)} in ${where(parent)}`);
  }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (el.closest(SKIP) && el.tagName.toLowerCase() !== "svg") continue;
    for (const attr of READ_ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (value === null) continue;
      const left = stray(value, allow);
      if (LETTER.test(left)) found.push(`${attr} ${show(left)} on ${where(el)}`);
    }
  }
  const head = hint(this, "toHaveNoHardcodedText", []);
  return {
    pass: found.length === 0,
    message: () =>
      this.isNot
        ? `${head}\n\n  Expected text outside the catalog, but every string is a marker or allowed.`
        : `${head}\n\n  Expected every string to come from the catalog, but found ${found.length} that did not:\n${found.map((f) => `    - ${f}`).join("\n")}`,
  };
}
