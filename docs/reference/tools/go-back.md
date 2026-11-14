---
description: "The go_back tool: one step back in the browser's history, like the Back button."
---

# `goBack`

The `go_back` tool: one step back in the browser's history, like the Back button. Reach for it so an agent can undo a navigation. With the Navigation API it says where that is, and it refuses when there is nowhere to go back to on this site.

## Import

```ts
import { goBack } from "@webmcp-agents/tools";
import type { GoBackOptions } from "@webmcp-agents/tools";
```

## Example

<include meta='title="tools/go-back.ts"'>/_examples/shared/reference/tools/go-back.ts</include>

## Input

### Parameters

None: the tool takes no input.

### Options

`goBack(options?)` takes a `GoBackOptions`, which is the options every common tool takes.

| Name | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | `"go_back"` | The tool's name (`a-z A-Z 0-9 _ . -`, 1 to 128). |
| `description` | `string` | says to use it for "go back", and that `get_page` tells you where you land | What the agent reads to decide when to call it. |

## Answer

A sentence (`string`). When the previous entry is in this document (a client router's), once the address has changed (up to 3 s, so the previous page's tools are registered by the agent's next step): `Went back to /products?color=blue.` (the previous entry's path, query and hash, or the full URL when it is on another origin). When it is another document, at once, before the page goes: `Going back to /products: the page is loading.` Without the Navigation API, at once: `Went back one page.`

With no previous page (`navigation.canGoBack` is `false`, or, without the Navigation API, `history.length` is 1) it fails with `unavailable`: `There is no previous page to go back to in this tab.`

## Notes

- It calls `history.back()`, so any client router sees an ordinary back navigation, and a tool with a `match` turns off as the path changes.
- The tool has no flags and no control, so it runs unseen.

## See also

- [Common tools](../../build/common-tools.mdx), the page that teaches it
- [`goTo`](./go-to.md) and [`getPage`](./get-page.md)
- [`defineWebTool`](../core/define-web-tool.md)
