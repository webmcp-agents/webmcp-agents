---
description: "Every element the chat renders, by name: data-wa-part hooks, state as data attributes, and a class or style per part."
---

# Chat parts

Every element `<AgentChat>` renders carries `data-wa-part` with its part name, and its state as data attributes. Use the
names to style one element from CSS, to add your classes and inline styles with
[`classNames` and `styles`](./agent-chat.md#props), or to find it in a test. `CHAT_PARTS` lists them all; `ChatPart` is
their type.

## Import

```ts
import { CHAT_PARTS } from "@webmcp-agents/chat";
import type { ChatPart } from "@webmcp-agents/chat";
```

## Example

```css
[data-wa-part="toolCard"][data-state="awaiting-confirmation"] {
  border-style: dashed;
}
[data-wa-part="message"][data-role="user"] [data-wa-part="bubble"] {
  font-weight: 500;
}
```

```tsx
<AgentChat
  classNames={{ panel: "shadow-2xl", send: "btn btn-primary" }}
  styles={{ launcher: { insetInlineEnd: 24 } }}
/>
```

## Props

The parts, and the state each one carries. A class from `classNames` is added after the built-in one (`wa-chat__*`,
kept, so selectors written for 0.4.0 still match).

| Name | Type | Default | Description |
|---|---|---|---|
| `root` | the host `<div>` | | `dir`, `lang`, `data-position`, `data-layout`, `data-theme` (from `colorScheme`). |
| `launcher` | `<button>` | | `data-open`, `data-busy` while a run streams, `aria-expanded`. |
| `panel` | `<div role="dialog">` | | `data-state` (`open` / `closed`), `data-open`, `data-busy`. |
| `resizer` | `<div role="separator">` | | The docked panel's inner edge. |
| `header`, `title`, `newChat`, `close` | | | The header and its buttons. |
| `adapterSwitcher`, `adapterOption`, `adapterDot` | radio group | | `data-state` on an option and its dot: `ready`, `pending`, `off`. |
| `modelPicker`, `modelLabel`, `modelSelect`, `modelOption`, `modelMeta` | | | The model picker. |
| `empty`, `emptyTitle`, `emptyHint` | | | The empty conversation. |
| `suggestions`, `suggestionItem`, `suggestion` | `<ul>`, `<li>`, `<button>` | | Starter prompts. |
| `scroll`, `messages` | `<div>`, `<div role="log">` | | The conversation; `data-busy` on `messages` during a run. |
| `message`, `messageBody` | | | `data-role` (`user` / `assistant`), `data-confirming` while its restore asks. |
| `bubble`, `text` | | | A message's text; `text` is one paragraph. |
| `reasoning` | | | Only with a `Reasoning` component of yours. |
| `toolCard` | | | `data-state`: `running`, `awaiting-confirmation`, `done`, `error`, `cancelled` (and the 0.4.0 `data-status`); `data-agent` for a sub-agent. |
| `toolHead`, `toolName`, `toolState`, `toolInput`, `toolOutput` | | | Inside a card; `toolState` carries `data-state` too. |
| `toolPrompt`, `toolPromptText`, `showOnPage` | | | While the call waits for the person's click on the page. |
| `subagent` | | | A sub-agent's run, nested in its card. |
| `working`, `workingDot`, `workingLabel` | | | The "working" indicator (`role="status"`). |
| `jumpToLatest` | `<button>` | | Shown when you scrolled up and something new arrived. |
| `restore`, `restoreAsk`, `restoreActions`, `restoreConfirm`, `restoreCancel` | | | Restore to before a message; `data-state` on `restore`: `idle` / `confirming`. |
| `restored` | `<p role="status">` | | The note after a restore. |
| `downloadCard`, `downloadTitle`, `downloadText`, `downloadMeta`, `downloadActions`, `downloadButton` | | | The on-device model; `data-state` on the card (`needs-download`, `downloading`, `loading`, `error`), `data-action` on a button. |
| `progress`, `progressBar` | `<div role="progressbar">`, `<span>` | | Download or load progress. |
| `error`, `errorText`, `retry` | `<div role="alert">` | | The last run's failure; `data-state` is its [code](./chat-error-codes.md). |
| `composer`, `field`, `input`, `send`, `stop`, `status` | | | The message box; `data-busy` on `composer`; `status` says why it is disabled. |
| `announcer` | `<p aria-live="polite">` | | Screen-reader announcements (a tool waiting for you). |
| `icon` | `<svg>` | | `data-icon` is its name. The drawing inside belongs to the icon. |

## Notes

- `styles` sets inline styles on a part (the root's go on the host element). A number is pixels, as in React.
- The registry blocks write the same part names, and their `classNames` take the same keys
  ([Use your shadcn components](../../more/shadcn-chat-blocks.mdx)).
- To replace a part with your own component, see [`ChatComponents`](./chat-components.md).

## See also

- [`ChatComponents`](./chat-components.md)
- [`ChatTheme`](./chat-theme.md)
- [`<AgentChat>`](./agent-chat.md)
