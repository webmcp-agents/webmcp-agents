/**
 * Finding a control the way a person (or a Testing Library query) does: by its role and the name on it. This is
 * how a tool's cursor knows where to go without anything added to the markup:
 *
 *   locate({ role: "button", name: "Remove Ocean Tee" })
 *
 * A small purpose-built matcher, not the full accessible-name algorithm: the roles a tool acts on or types into,
 * and the naming sources interfaces actually use. Nothing here touches the DOM at import.
 */
import { UI_HOST_ATTR } from "./user-yield";

/** Which control on the page: by role, by the name a screen reader would say, inside a part of the page. Every part optional. */
export interface ToolLocator {
  /**
   * The ARIA role: `button`, `link`, `tab`, `menuitem`, `switch`, `checkbox`, `radio`, `textbox`, `searchbox`,
   * `spinbutton`, `slider`, `combobox`, `listbox`, or any explicit `role` attribute. Native elements have theirs
   * (`<button>` is a button, `<a href>` a link, `<select>` a combobox). Default: any of them.
   */
  role?: string;
  /**
   * The accessible name: `aria-labelledby`, `aria-label`, the control's `<label>`, its `placeholder`, then its text
   * (an image inside by its `alt`; `aria-hidden` and `hidden` parts left out), `alt`, `title`. A string compares trimmed, with whitespace collapsed and case ignored; an exact match beats a
   * name that only starts with it. A RegExp is tested against the name as shown.
   */
  name?: string | RegExp;
  /** Only look inside this element (or the first match of this selector). Default: the whole document. */
  within?: string | Element;
}

/** Roles a tool acts on: where the cursor clicks or parks when a tool names no `target`. */
export const ACTIONS = /^(button|link|tab|menuitem|switch)$/;
/** Roles a parameter's value goes into. */
const FIELDS = /^(textbox|searchbox|spinbutton|slider|combobox|listbox|checkbox|radio|switch)$/;

const CANDIDATES = "button,a[href],input,select,textarea,summary,[role]";

/** Roles by tag, and by `type` for an input (a checkbox, a radio and a button are their own type; any other is a textbox). */
const TAG_ROLES: Record<string, string> = { a: "link", button: "button", summary: "button", select: "combobox", textarea: "textbox" };
const TYPE_ROLES: Record<string, string> = {
  submit: "button",
  reset: "button",
  image: "button",
  range: "slider",
  number: "spinbutton",
  search: "searchbox",
  hidden: "",
};

/** The element's role: its `role` attribute, else what its tag implies. Empty for an element with none. */
function roleOf(el: Element): string {
  const type = (el as HTMLInputElement).type;
  return (
    el.getAttribute("role") ??
    (el.localName === "input"
      ? (TYPE_ROLES[type] ?? (/^(button|checkbox|radio)$/.test(type) ? type : "textbox"))
      : TAG_ROLES[el.localName]) ??
    ""
  );
}

/** Trimmed, with runs of whitespace collapsed. */
const clean = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim();

/** `clear_cart`, `lineId`, `first-name` read as words: "clear cart", "line Id", "first name". */
export const words = (id: string): string => id.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_.-]+/g, " ");

const UNSAID = "[aria-hidden=true],[hidden]";

/**
 * The text a person reads in `el`: without its `aria-hidden` and `hidden` parts (an icon font's ligature, a
 * collapsed hint), and with an image by its `alt`.
 */
const textOf = (el: Element): string =>
  el.querySelector(`${UNSAID},[alt]`)
    ? [...el.childNodes]
        .map((n) =>
          n instanceof Element ? (n.matches(UNSAID) ? "" : (n.getAttribute("alt") ?? textOf(n))) : n instanceof Text ? n.data : "",
        )
        .join("")
    : (el.textContent ?? "");

/** The name a screen reader would say for `el`, from the sources listed on `ToolLocator.name`. */
function nameOf(el: Element): string {
  const attr = (name: string): string => clean(el.getAttribute(name));
  return (
    clean(
      attr("aria-labelledby")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent)
        .join(" "),
    ) ||
    attr("aria-label") ||
    clean((el as HTMLInputElement).labels?.[0]?.textContent) ||
    attr("placeholder") ||
    // a select's text is its options, a textarea's its value
    clean(el.matches("select,textarea") ? "" : textOf(el)) ||
    attr("alt") ||
    attr("title") ||
    (roleOf(el) === "button" ? attr("value") : "")
  );
}

/**
 * True when a person could use `el` right now: rendered, visible, enabled, and not inside an `inert` or
 * `aria-hidden` part of the page or inside library UI (the devtools, the chat).
 */
export const usable = (el: Element): boolean =>
  !el.matches(":disabled,[aria-disabled=true]") &&
  !el.closest(`[inert],[aria-hidden=true],[${UI_HOST_ATTR}]`) &&
  (el.checkVisibility?.({ visibilityProperty: true }) ?? !!el.getClientRects()[0]);

/**
 * Every usable control matching `locator`, in document order: the ones named exactly `name` when there are any,
 * else the ones whose name starts with it. `roles` limits the roles considered when the locator names none.
 */
export function locateAll({ role, name, within }: ToolLocator, roles: RegExp = /./): Element[] {
  const root = typeof within === "string" ? document.querySelector(within) : (within ?? document);
  const want = typeof name === "string" ? clean(name).toLowerCase() : name;
  const exact: Element[] = [];
  const prefixed: Element[] = [];
  for (const el of root?.querySelectorAll(CANDIDATES) ?? []) {
    const own = roleOf(el);
    if (!(role ? own === role : roles.test(own))) continue;
    const has = want === undefined ? "" : nameOf(el);
    const list =
      want === undefined || (typeof want === "string" ? has.toLowerCase() === want : has.search(want) >= 0)
        ? exact
        : want && typeof want === "string" && has.toLowerCase().startsWith(want)
          ? prefixed
          : null;
    // Last, and only for a control with the right name: it reads styles, the name does not.
    if (list && usable(el)) list.push(el);
  }
  return exact[0] ? exact : prefixed;
}

/** The first usable control matching `locator` (see `locateAll`), or null. */
export const locate = (locator: ToolLocator): Element | null => locateAll(locator)[0] ?? null;

/** Where one parameter is typed: a locator, the field's label, or `false` for "never type this one". */
export type FieldTarget = ToolLocator | string | false;

/**
 * The field a parameter's value is typed into. An explicit `spec` is looked up as given. Otherwise the search
 * starts at the tool's control (`from`) and widens one ancestor at a time, so the closest field wins: a control
 * whose `name` is the parameter (the radio with this `value`, for radios), else one labelled with the schema's
 * `title` for it, else with the parameter read as words. Null when nothing matches, or with no `from` to start at.
 */
export function locateField(
  param: string,
  value: unknown,
  spec: FieldTarget | undefined,
  title: string | undefined,
  from: Element | null,
): Element | null {
  if (spec) return locateAll(typeof spec === "string" ? { name: spec } : spec, FIELDS)[0] ?? null;
  for (let scope = from?.parentElement; scope; scope = scope.parentElement) {
    const hit =
      [...scope.querySelectorAll<HTMLInputElement>(`:is(input,select,textarea)[name="${CSS.escape(param)}"]`)].find(
        (f) => usable(f) && (f.type !== "radio" || f.value === String(value)),
      ) ??
      (title ? locateAll({ name: title, within: scope }, FIELDS)[0] : undefined) ??
      locateAll({ name: words(param), within: scope }, FIELDS)[0];
    if (hit) return hit;
  }
  return null;
}
