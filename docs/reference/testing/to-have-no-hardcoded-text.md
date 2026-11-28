---
description: "The rendered chat shows no text that bypassed its messages catalog: only sentinel markers, punctuation, digits and the text you allow."
---

# `toHaveNoHardcodedText`

The sentinel-catalog check as a matcher. Render the chat with every catalog entry replaced by a marker
([`renderChat({ sentinel: true })`](./render-chat.md)); then every text node, and every `aria-label`, `placeholder`,
`title`, `alt` and `aria-valuetext`, must hold only `⟦markers⟧`, punctuation and digits, or text you allow (the
person's and the model's own words). It fails naming each stray string and the part it is in.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
import type { NoHardcodedTextOptions } from "@webmcp-agents/testing";
```

## Example

```ts
const chat = await renderChat({ adapter, sentinel: true });
await expect(chat).toHaveNoHardcodedText({ allow: ["Add a mug", /Order \d+/g] });
```

A failure reads like this:

```text
Expected every string to come from the catalog, but found 1 that did not:
  - aria-label "Close" on <button data-wa-part="close">
```

## Options

`expect(received).toHaveNoHardcodedText(options?)`. `received` is what `renderChat` returns, or any element.

| Name | Type | Default | Description |
|---|---|---|---|
| `allow` | `readonly (string \| RegExp)[]` | `[]` | Text that is not the chat's own: what the person typed, what the model, a tool or an adapter said. A string is removed wherever it appears; a RegExp with the `g` flag likewise. |

## Returns

Nothing: it passes, or fails the test with the list of stray strings.

## Notes

- Letters in any script count; digits and punctuation around markers do not (a formatted percent, " · ").
- Styles, scripts and the drawing inside an icon (`<svg>`) are skipped.
- A value that is neither a rendered chat nor an element fails with a sentence, under `.not` too.

## See also

- [`renderChat`](./render-chat.md)
- [`ChatMessages`](../chat/chat-messages.md)
