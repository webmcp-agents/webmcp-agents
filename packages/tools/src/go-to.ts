/**
 * `go_to`: open one of the pages your site lists, by name. It clicks the page's own link to that path when one is on
 * screen (so React Router, TanStack Router, Next.js or any other client router handles it, and the cursor shows
 * where it went), and falls back to `location.assign` when there is none. Only the pages you list can be opened.
 *
 *   goTo({ pages: { home: "/", cart: "/cart", orders: "/orders" } })
 */
import { defineWebTool, RESPONSE_GRACE_MS, type WebTool, WebToolError } from "@webmcp-agents/core";
import { addressSettles, type CommonToolOptions, usable } from "./shared";

/** Options for `goTo`. */
export interface GoToOptions extends CommonToolOptions {
  /**
   * The pages an agent may open: a name the agent picks from, and the path (or same-site URL) it opens, e.g.
   * `{ home: "/", cart: "/cart", orders: "/orders" }`. Names read best short and plain.
   */
  pages: Readonly<Record<string, string>>;
  /**
   * Your router's navigation, used when no link to the page is on screen: `(to) => router.push(to)` (Next.js, whose
   * router only exists in React: hand it over from a component), React Router's `navigate`, TanStack's. The page
   * changes without a load, so the chat, the cursor and calls in flight stay. Default: a page load.
   */
  navigate?: (to: string) => unknown;
}

/** What `go_to` takes. */
export interface GoToInput {
  /** One of the page names. */
  page: string;
}

const trim = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, "") : path);
const samePage = (a: URL, b: URL): boolean =>
  a.origin === b.origin && trim(a.pathname) === trim(b.pathname) && a.search === b.search && a.hash === b.hash;

/** The first link on the page a person could click to open `url` in this tab. */
function linkTo(url: URL): HTMLAnchorElement | undefined {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]:not([download])")) {
    const tab = a.getAttribute("target");
    if (tab && tab !== "_self") continue;
    try {
      if (samePage(new URL(a.href, location.href), url) && usable(a)) return a;
    } catch {
      // an href that isn't a URL
    }
  }
  return undefined;
}

/** The `go_to` tool: navigate to one of `pages` by name. */
export function goTo({ id = "go_to", description, pages, navigate }: GoToOptions): WebTool<GoToInput, string> {
  const names = Object.keys(pages ?? {});
  if (names.length === 0) throw new TypeError(`${id}: pass the pages it may open, e.g. goTo({ pages: { home: "/", cart: "/cart" } }).`);
  for (const name of names) {
    if (typeof pages[name] !== "string") throw new TypeError(`${id}: the path of page "${name}" must be a string, e.g. "/cart".`);
  }
  const list = names.map((name) => `${name} (${pages[name]})`).join(", ");
  const urlFor = (page: unknown): URL | undefined =>
    typeof page === "string" && Object.hasOwn(pages, page) ? new URL(pages[page]!, location.href) : undefined;

  return defineWebTool<GoToInput, string>({
    id,
    title: "Go to a page",
    description:
      description ??
      `Open one of this site's pages by name: ${list}. Use when the user asks to go to one of them, or a tool you need lives on that page. Needs nothing first. Next: the tools of that page; get_page tells you where you are.`,
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string", enum: names, description: `The page's name, one of ${names.join(", ")}; e.g. "${names[0]}".` },
      },
      required: ["page"],
    },
    // the cursor goes to the link it will click (none: it runs unseen and the page loads instead)
    target: (input) => {
      const url = urlFor((input as Partial<GoToInput> | undefined)?.page);
      return url ? linkTo(url) : undefined;
    },
    execute: async ({ page }) => {
      const url = urlFor(page);
      if (!url) throw new WebToolError("invalid_input", `There is no page "${page}". The pages are: ${list}.`);
      if (samePage(url, new URL(location.href))) return `Already on ${page} (${pages[page]}).`;
      const link = linkTo(url);
      if (link) {
        // A client router takes the click (and calls preventDefault): wait for it to change the address. Otherwise
        // the browser loads the page, and this document goes before the address would change here: answer now.
        let routed = true;
        const seen = (e: Event): void => {
          routed = e.defaultPrevented;
        };
        addEventListener("click", seen, { once: true });
        try {
          link.click();
        } finally {
          removeEventListener("click", seen);
        }
        if (!routed && !samePage(url, new URL(location.href))) return `Opening ${page} (${pages[page]}): the page is loading.`;
        return (await addressSettles(() => samePage(url, new URL(location.href))))
          ? `Opened ${page} (${pages[page]}).`
          : `Clicked the link to ${page} (${pages[page]}), but the address has not changed yet. Check with get_page before using that page's tools.`;
      }
      if (navigate) {
        await navigate(url.pathname + url.search + url.hash);
        return (await addressSettles(() => samePage(url, new URL(location.href))))
          ? `Opened ${page} (${pages[page]}).`
          : `Asked the site to open ${page} (${pages[page]}), but the address has not changed yet. Check with get_page before using that page's tools.`;
      }
      // a full page load: answer first, so the agent hears it before this document goes
      setTimeout(() => location.assign(url.href), RESPONSE_GRACE_MS);
      return `Opening ${page} (${pages[page]}): the page is loading.`;
    },
  });
}
