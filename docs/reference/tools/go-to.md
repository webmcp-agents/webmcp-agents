---
description: "The go_to tool: open one of the pages your site lists, by name."
---

# `goTo`

The `go_to` tool: open one of the pages your site lists, by name. Reach for it when an agent needs to move between pages whose tools live on different routes. It clicks the page's own link to that path when one is on screen, so React Router, TanStack Router, Next.js or any other client router handles it and the cursor shows where it went; without such a link it loads the URL. Only the pages you list can be opened.

## Import

```ts
import { goTo } from "@webmcp-agents/tools";
import type { GoToInput, GoToOptions } from "@webmcp-agents/tools";
```

## Example

<include meta='title="tools/go-to.ts"'>/_examples/shared/reference/tools/go-to.ts</include>

## Input

### Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| `page` | `string` | required | One of the page names you listed (an `enum` in the schema), e.g. `"cart"`. |

### Options

`goTo(options)` takes a `GoToOptions`, which extends the options every common tool takes (`id`, `description`).

| Name | Type | Default | Description |
|---|---|---|---|
| `pages` | `Readonly<Record<string, string>>` | required | The pages an agent may open: a name the agent picks from, and the path (or same-site URL) it opens, e.g. `{ home: "/", cart: "/cart", orders: "/orders" }`. Short, plain names read best. |
| `navigate` | `(to: string) => unknown` | a page load | Your router's navigation, used when no link to the page is on screen: `(to) => router.push(to)` (Next.js: hand the router over from a component), React Router's `navigate`. The page changes without a load, so the chat, the cursor and calls in flight stay. |
| `id` | `string` | `"go_to"` | The tool's name (`a-z A-Z 0-9 _ . -`, 1 to 128). |
| `description` | `string` | lists the pages, and says to use it when the user asks to go to one or when a tool needed lives on that page | What the agent reads to decide when to call it. |

## Answer

A sentence (`string`):

- `Opened cart (/cart).` after clicking the page's own link, once the address is that page. A client router changes it a moment after the click (Next.js: once the route's payload arrives), so the call waits for it, up to 3 s: the new page's tools register right after the answer, where a chat waiting for the tools to settle sees them before its next step;
- `Clicked the link to cart (/cart), but the address has not changed yet. Check with get_page before using that page's tools.` when the address has not changed within those 3 s;
- `Opening cart (/cart): the page is loading.` when the link's click was not taken by a client router (no `preventDefault`: the browser loads the page, so the call answers at once), or when there was no link and no `navigate`, and the URL is loaded (the call answers first, then loads after `RESPONSE_GRACE_MS`, so the agent hears it before this document goes);
- `Already on cart (/cart).` when the URL already is the current one.

An unknown name fails with `invalid_input` and lists the pages.

## Notes

- `goTo` throws a `TypeError` at definition when `pages` is empty or a path is not a string.
- Core does not validate a JSON Schema input, so the tool checks the name itself.
- The link is found by its `href` (same origin, path, query and hash), not by a name: a link's name does not say where it goes. Links that open another tab (`target` other than `_self`), `download` links, hidden or `inert` links and library UI are skipped.
- The tool's `target` is that link, so the cursor flies to it. With no link, the call runs unseen and the page loads.
- A page that needs state first (a checkout that needs a non-empty cart, with no link on the page) is better served by an app tool of your own than by `go_to`; Field Store does this with `go_to_page`.
- The tool has no flags.

## See also

- [Common tools](../../build/common-tools.mdx), the page that teaches it
- [`goBack`](./go-back.md) and [`getPage`](./get-page.md)
- [`defineWebTool`](../core/define-web-tool.md)
