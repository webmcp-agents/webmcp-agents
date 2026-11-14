import { installWebMCPPolyfill } from "@webmcp-agents/core/polyfill";
import { registerWebTool, UI_HOST_ATTR, type WebTool, type WebToolContext } from "@webmcp-agents/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPage, goBack, goTo, scrollTo, setTheme } from "./index";

const ctx = (): WebToolContext => ({ signal: new AbortController().signal, source: "test" });
const until = async (check: () => boolean, timeout = 3000, label = "condition") => {
  const started = performance.now();
  while (!check()) {
    if (performance.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 16));
  }
};
const fixture = (html: string): HTMLElement => {
  const root = document.createElement("div");
  root.className = "test-fixture";
  root.innerHTML = html;
  document.body.append(root);
  return root;
};
let uid = 0;
/** The polyfill registry lives as long as the page: one id per registration. */
const registered = <I, O>(make: (id: string) => WebTool<I, O>): WebTool<I, O> => {
  const tool = make(`tool_${++uid}`);
  offs.push(registerWebTool(tool as WebTool));
  return tool;
};
const offs: Array<() => void> = [];
const start = location.href;

beforeAll(() => installWebMCPPolyfill());
afterEach(() => {
  for (const off of offs.splice(0)) off();
  for (const el of document.querySelectorAll(".test-fixture")) el.remove();
  getSelection()?.removeAllRanges();
  history.replaceState(null, "", start);
  vi.restoreAllMocks();
});

describe("get_page", () => {
  it("answers the title, path, query parameters, hash, language, selection and headings", async () => {
    history.replaceState(null, "", "/shop/mugs?tag=blue&tag=large&q=coffee%20mug#reviews");
    document.title = "Mugs · Field Store";
    document.documentElement.lang = "en-GB";
    const root = fixture(`
      <h1>Mugs</h1><p>Our <span id="pick">stoneware mugs</span> hold 350 ml.</p>
      <h2 id="reviews">Reviews</h2><h3 hidden>Hidden heading</h3><div role="heading" aria-level="3">Shipping</div>`);
    const range = document.createRange();
    range.selectNodeContents(root.querySelector("#pick")!);
    getSelection()!.addRange(range);

    const tool = registered((id) => getPage({ id }));
    const { structuredContent: page, content } = await tool.invoke();

    expect(page).toMatchObject({
      title: "Mugs · Field Store",
      path: "/shop/mugs",
      query: { tag: ["blue", "large"], q: "coffee mug" },
      hash: "reviews",
      language: "en-GB",
      selection: "stoneware mugs",
    });
    expect(page.headings).toEqual(
      expect.arrayContaining([
        { level: 1, text: "Mugs" },
        { level: 2, text: "Reviews", id: "reviews" },
        { level: 3, text: "Shipping" },
      ]),
    );
    expect(page.headings.some((h) => h.text === "Hidden heading")).toBe(false);
    expect(content[0].text).toContain("Query parameters: tag=blue, large; q=coffee mug");
    expect(content[0].text).toContain('Selected text: "stoneware mugs"');
  });

  it("ignores a selection inside library UI (the chat, the devtools)", async () => {
    const root = fixture(`<div ${UI_HOST_ATTR}="chat"><p id="ui">typed in the chat</p></div>`);
    const range = document.createRange();
    range.selectNodeContents(root.querySelector("#ui")!);
    getSelection()!.addRange(range);
    expect((await getPage().run({}, ctx())).structuredContent.selection).toBe("");
  });
});

describe("go_to", () => {
  it("opens a listed page by clicking the page's own link, so the site's router handles it", async () => {
    const root = fixture(
      `<nav><a href="/cart" target="_blank">Cart (new tab)</a><a href="/cart">Cart</a><a href="/orders">Orders</a></nav>`,
    );
    const clicked: string[] = [];
    // what a client router does with a link click
    root.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a")!;
      e.preventDefault();
      clicked.push(a.textContent!);
      history.pushState(null, "", a.getAttribute("href"));
    });
    const tool = registered((id) => goTo({ id, pages: { home: "/", cart: "/cart", orders: "/orders" } }));

    expect(await tool.invoke({ page: "cart" })).toBe("Opened cart (/cart).");
    expect(clicked).toEqual(["Cart"]);
    expect(location.pathname).toBe("/cart");
    expect(await tool.invoke({ page: "cart" })).toBe("Already on cart (/cart).");
    expect(clicked).toEqual(["Cart"]);
  });

  it("answers once the router has changed the address, not at the click", async () => {
    const root = fixture(`<a href="/later">Later</a><a href="/never">Never</a>`);
    // like Next.js: the URL changes once the route's payload has arrived, a moment after the click
    root.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a")!;
      e.preventDefault();
      if (a.textContent === "Later") setTimeout(() => history.pushState(null, "", "/later"), 300);
    });
    const tool = registered((id) => goTo({ id, pages: { later: "/later", never: "/never" } }));
    const started = performance.now();
    expect(await tool.invoke({ page: "later" })).toBe("Opened later (/later).");
    expect(performance.now() - started).toBeGreaterThanOrEqual(290);
    expect(location.pathname).toBe("/later");
    // a router that never moves: the tool says so instead of claiming the page is open
    expect(await tool.invoke({ page: "never" })).toMatch(/^Clicked the link to never \(\/never\), but the address has not changed yet/);
  }, 10_000);

  it("without a link on the page, uses the app's router when given one (no page load)", async () => {
    const pushed: string[] = [];
    const tool = registered((id) =>
      goTo({
        id,
        pages: { checkout: "/checkout?step=1" },
        navigate: (to) => {
          pushed.push(to);
          setTimeout(() => history.pushState(null, "", to), 100);
        },
      }),
    );
    expect(await tool.invoke({ page: "checkout" })).toBe("Opened checkout (/checkout?step=1).");
    expect(pushed).toEqual(["/checkout?step=1"]);
    expect(location.pathname + location.search).toBe("/checkout?step=1");
  });

  it("opens only the listed pages", async () => {
    const tool = registered((id) => goTo({ id, pages: { cart: "/cart" } }));
    await expect(tool.invoke({ page: "admin" })).rejects.toMatchObject({
      code: "invalid_input",
      message: expect.stringContaining("cart (/cart)"),
    });
    await expect(goTo({ pages: { cart: "/cart" } }).run({ page: "toString" }, ctx())).rejects.toThrow(/There is no page "toString"/);
  });

  it("without a link on the page, loads the URL (after answering)", async () => {
    const tool = registered((id) => goTo({ id, pages: { pricing: "#pricing" } }));
    expect(await tool.invoke({ page: "pricing" })).toBe("Opening pricing (#pricing): the page is loading.");
    expect(location.hash).toBe(""); // the answer goes out first
    await until(() => location.hash === "#pricing", 2000, "the fallback navigation");
  });
});

describe("go_back", () => {
  it("goes back one step and says where", async () => {
    history.pushState(null, "", "/first");
    history.pushState(null, "", "/second");
    const tool = registered((id) => goBack({ id }));
    expect(await tool.invoke()).toBe("Went back to /first.");
    await until(() => location.pathname === "/first", 2000, "back");
  });
});

describe("scroll_to", () => {
  const page = () =>
    fixture(`
      <h2>Pricing</h2><p>Plans start at 5 € a month.</p>
      <h2>Shipping and returns</h2><p>Free shipping over 50 €.</p><h3>Returns</h3><p>30-day returns on everything.</p>
      <h2>Contact</h2><p>Write to us.</p>`);

  it("scrolls to a heading, highlights it, and quotes its section", async () => {
    page();
    const tool = registered((id) => scrollTo({ id, highlightMs: 5000 }));
    const answer = await tool.invoke({ text: "shipping" });
    expect(answer).toBe(
      'Scrolled to the heading "Shipping and returns" and highlighted it. It reads: Free shipping over 50 €. Returns 30-day returns on everything.',
    );
    const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    if (highlights) expect(highlights.has("web-agents-scroll-to")).toBe(true);
  });

  it("finds words in body text; an exact heading beats a longer one", async () => {
    page();
    expect(await scrollTo().run({ text: "30-day returns" }, ctx())).toBe(
      'Scrolled to "30-day returns" and highlighted it. It reads: 30-day returns on everything.',
    );
    expect(await scrollTo().run({ text: "Returns" }, ctx())).toMatch(/^Scrolled to the heading "Returns"/);
  });

  it("says what the page has when nothing matches", async () => {
    page();
    await expect(scrollTo().run({ text: "warranty" }, ctx())).rejects.toMatchObject({
      code: "invalid_input",
      message: expect.stringContaining("Its headings: Pricing | Shipping and returns | Returns | Contact"),
    });
  });
});

describe("set_theme", () => {
  const html = document.documentElement;
  afterEach(() => {
    html.removeAttribute("data-theme");
    html.classList.remove("dark");
  });

  it("presses the site's theme switch: a round trip dark → light, and flipping", async () => {
    html.dataset.theme = "light";
    const root = fixture(`<header><button type="button" aria-label="Toggle theme">◐</button></header>`);
    const button = root.querySelector("button")!;
    const presses = vi.fn(() => (html.dataset.theme = html.dataset.theme === "dark" ? "light" : "dark"));
    button.addEventListener("click", presses);
    const set = vi.fn();
    const tool = registered((id) => setTheme({ id, set }));

    expect(await tool.invoke({ theme: "dark" })).toBe("The theme is now dark.");
    expect(html.dataset.theme).toBe("dark");
    expect(await tool.invoke({ theme: "dark" })).toBe("The theme is already dark.");
    expect(await tool.invoke()).toBe("The theme is now light.");
    expect(html.dataset.theme).toBe("light");
    expect(presses).toHaveBeenCalledTimes(2);
    expect(set).not.toHaveBeenCalled();
    // a two-state switch cannot reach "system": `set` does
    expect(await tool.invoke({ theme: "system" })).toBe("The theme is now system.");
    expect(set).toHaveBeenCalledWith("system");
  });

  it("with no switch on the page, calls `set`, reading the theme through `get`", async () => {
    let theme: "light" | "dark" | "system" = "light";
    const tool = setTheme({
      get: () => theme,
      set: (next) => {
        theme = next;
      },
    });
    expect(await tool.run({ theme: "dark" }, ctx())).toBe("The theme is now dark.");
    expect(theme).toBe("dark");
    expect(await tool.run({}, ctx())).toBe("The theme is now light.");
    expect(theme).toBe("light");
  });

  it("reads a dark class on <html>; with neither a switch nor `set` it says so", async () => {
    html.classList.add("dark");
    await expect(setTheme().run({}, ctx())).rejects.toMatchObject({
      code: "unavailable",
      message: expect.stringContaining("no theme switch"),
    });
    await expect(setTheme().run({ theme: "dark" }, ctx())).resolves.toBe("The theme is already dark.");
    await expect(setTheme().run({ theme: "blue" as never }, ctx())).rejects.toMatchObject({ code: "invalid_input" });
  });
});
