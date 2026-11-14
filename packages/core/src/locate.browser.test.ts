import { afterEach, describe, expect, it } from "vitest";
import { ACTIONS, locate, locateAll, locateField, words } from "./locate";
import { UI_HOST_ATTR } from "./user-yield";
import { cleanupFixtures, fixture } from "./test-utils";

const ids = (els: readonly Element[]): string[] => els.map((el) => el.id);

describe("locate", () => {
  afterEach(cleanupFixtures);

  it("finds a control by role and by each source of its name", () => {
    fixture(`
      <button id="by-text" type="button">  Clear
        cart </button>
      <button id="by-aria" type="button" aria-label="Remove Ocean Tee"><svg></svg></button>
      <span id="heading">Shipping</span> <span id="hint">address</span>
      <button id="by-labelledby" type="button" aria-labelledby="heading hint">Edit</button>
      <label for="by-label">Quantity</label> <input id="by-label" type="number">
      <label>Gift wrap <input id="by-wrapping-label" type="checkbox"></label>
      <input id="by-placeholder" placeholder="Search products">
      <a id="by-link" href="#orders">Your orders</a>
      <button id="by-title" type="button" title="Close"></button>
      <input id="by-value" type="submit" value="Send">
      <div id="by-role" role="tab">Reviews</div>`);
    expect(locate({ role: "button", name: "clear cart" })?.id).toBe("by-text"); // trimmed, collapsed, case-insensitive
    expect(locate({ role: "button", name: "Remove Ocean Tee" })?.id).toBe("by-aria");
    expect(locate({ role: "button", name: "Shipping address" })?.id).toBe("by-labelledby"); // labelledby wins over the text
    expect(locate({ role: "spinbutton", name: "Quantity" })?.id).toBe("by-label");
    expect(locate({ role: "checkbox", name: "Gift wrap" })?.id).toBe("by-wrapping-label");
    expect(locate({ role: "textbox", name: "Search products" })?.id).toBe("by-placeholder");
    expect(locate({ role: "link", name: "Your orders" })?.id).toBe("by-link");
    expect(locate({ role: "button", name: "Close" })?.id).toBe("by-title");
    expect(locate({ role: "button", name: "Send" })?.id).toBe("by-value");
    expect(locate({ role: "tab", name: /^rev/i })?.id).toBe("by-role");
    expect(locate({ name: "Your orders" })?.id).toBe("by-link"); // no role: any control
    expect(locate({ role: "button", name: "Nothing like it" })).toBeNull();
  });

  it("names a control by the text a person reads: no hidden parts, an image by its alt", () => {
    fixture(`
      <button id="ligature" type="button"><span class="material-icons" aria-hidden="true">add_shopping_cart</span> Add to cart</button>
      <button id="collapsed" type="button">Save <span hidden>(unsaved changes)</span></button>
      <button id="image" type="button"><img alt="Close dialog" src="data:,"></button>
      <button id="nested" type="button"><span><b>Check</b>out <i aria-hidden="true">→</i></span></button>
      <button id="comment" type="button"><!-- icon --><span aria-hidden="true">x</span>Remove</button>`);
    expect(locateAll({ role: "button", name: "Add to cart" }).map((el) => el.id)).toEqual(["ligature"]);
    expect(locate({ role: "button", name: "Save" })?.id).toBe("collapsed");
    expect(locate({ role: "button", name: "Close dialog" })?.id).toBe("image");
    expect(locate({ role: "button", name: "Checkout" })?.id).toBe("nested");
    expect(locate({ role: "button", name: "Remove" })?.id).toBe("comment");
  });

  it("skips what a person could not use: hidden, inert, aria-hidden, disabled, library UI", () => {
    fixture(`
      <button id="display-none" type="button" style="display: none">Save</button>
      <button id="invisible" type="button" style="visibility: hidden">Save</button>
      <div style="display: none"><button id="in-hidden" type="button">Save</button></div>
      <div inert><button id="in-inert" type="button">Save</button></div>
      <div aria-hidden="true"><button id="in-aria-hidden" type="button">Save</button></div>
      <button id="disabled" type="button" disabled>Save</button>
      <fieldset disabled><button id="in-disabled-fieldset" type="button">Save</button></fieldset>
      <button id="aria-disabled" type="button" aria-disabled="true">Save</button>
      <div ${UI_HOST_ATTR}><button id="in-library-ui" type="button">Save</button></div>
      <input id="hidden-input" type="hidden" aria-label="Save">
      <button id="usable" type="button">Save</button>`);
    expect(ids(locateAll({ name: "Save" }))).toEqual(["usable"]);
  });

  it("prefers the controls named exactly, and falls back to the ones whose name starts with it", () => {
    fixture(`
      <button id="longer" type="button">Add to cart and checkout</button>
      <button id="exact-1" type="button">Add to cart</button>
      <button id="exact-2" type="button">ADD TO CART</button>
      <button id="inside" type="button">Quick add to cart</button>`);
    expect(ids(locateAll({ role: "button", name: "Add to cart" }))).toEqual(["exact-1", "exact-2"]);
    expect(ids(locateAll({ role: "button", name: "Add to" }))).toEqual(["longer", "exact-1", "exact-2"]);
    expect(ids(locateAll({ role: "button", name: "to cart" }))).toEqual([]); // starts with, not contains
    expect(ids(locateAll({ role: "button", name: /cart/i }))).toHaveLength(4); // a RegExp is tested as written
  });

  it("looks only inside `within` (an element or a selector)", () => {
    const root = fixture(`
      <section id="first"><button id="a" type="button">Remove</button></section>
      <section id="second"><button id="b" type="button">Remove</button></section>`);
    expect(locate({ name: "Remove", within: "#second" })?.id).toBe("b");
    expect(locate({ name: "Remove", within: root.querySelector("#first") as Element })?.id).toBe("a");
    expect(locate({ name: "Remove", within: "#no-such-part" })).toBeNull();
  });

  it("limits the roles when the locator names none: a tool acts on buttons, links, tabs, menu items and switches", () => {
    fixture(`
      <input id="field" aria-label="Search">
      <button id="button" type="button">Search</button>
      <div id="switch" role="switch" aria-checked="false" aria-label="Search"></div>
      <div id="menuitem" role="menuitem">Search</div>`);
    expect(ids(locateAll({ name: "Search" }, ACTIONS))).toEqual(["button", "switch", "menuitem"]);
  });

  it("reads an id or a parameter as words", () => {
    expect(words("clear_cart")).toBe("clear cart");
    expect(words("lineId")).toBe("line Id");
    expect(words("first-name.last")).toBe("first name last");
  });
});

describe("locateField", () => {
  afterEach(cleanupFixtures);

  it("finds a parameter's field by `name`, then by the schema title, then by the parameter as words", () => {
    const root = fixture(`
      <form>
        <input id="by-name" name="quantity" type="number">
        <label for="by-title">Delivery date</label> <input id="by-title" type="date">
        <label for="by-words">Gift note</label> <textarea id="by-words"></textarea>
        <button type="submit">Add</button>
      </form>`);
    const from = root.querySelector("button");
    expect(locateField("quantity", 2, undefined, undefined, from)?.id).toBe("by-name");
    expect(locateField("date", "2026-12-01", undefined, "Delivery date", from)?.id).toBe("by-title");
    expect(locateField("giftNote", "hi", undefined, undefined, from)?.id).toBe("by-words");
    expect(locateField("gift_note", "hi", undefined, "No such label", from)?.id).toBe("by-words"); // title first, then words
    expect(locateField("coupon", "X", undefined, undefined, from)).toBeNull();
  });

  it("takes the field closest to the tool's control", () => {
    const root = fixture(`
      <div class="card"><input id="far" name="quantity"><button type="button">Add</button></div>
      <div class="card"><input id="near" name="quantity"><button id="from" type="button">Add</button></div>`);
    expect(locateField("quantity", 1, undefined, undefined, root.querySelector("#from"))?.id).toBe("near");
  });

  it("picks the radio whose value is the parameter's", () => {
    const root = fixture(`
      <form>
        <label><input id="s" type="radio" name="size" value="s"> Small</label>
        <label><input id="m" type="radio" name="size" value="m"> Medium</label>
        <button type="submit">Add</button>
      </form>`);
    expect(locateField("size", "m", undefined, undefined, root.querySelector("button"))?.id).toBe("m");
    expect(locateField("size", "xl", undefined, undefined, root.querySelector("button"))).toBeNull();
  });

  it("looks an explicit field up as given (a label or a locator), anywhere on the page", () => {
    const root = fixture(`
      <header><input id="search" aria-label="Search the store"></header>
      <main><div id="size" role="combobox" aria-label="Size" tabindex="0">M</div><button type="button">Go</button></main>`);
    const from = root.querySelector("button");
    expect(locateField("q", "tee", "Search the store", undefined, from)?.id).toBe("search");
    expect(locateField("size", "L", { role: "combobox", name: "Size" }, undefined, from)?.id).toBe("size");
    expect(locateField("q", "tee", "Search the store", undefined, null)?.id).toBe("search"); // no control to start from
    expect(locateField("q", "tee", undefined, undefined, null)).toBeNull(); // nothing to infer from
  });

  it("never offers a button as a field", () => {
    const root = fixture(
      '<div><button id="named" type="button" name="quantity">Quantity</button><button id="from" type="button">Add</button></div>',
    );
    // a label match is limited to field roles, a `name` match to native fields (a button has a `name` too)
    expect(locateField("amount", 1, undefined, "Quantity", root.querySelector("#from"))).toBeNull();
    expect(locateField("quantity", 1, undefined, undefined, root.querySelector("#from"))).toBeNull();
  });
});
