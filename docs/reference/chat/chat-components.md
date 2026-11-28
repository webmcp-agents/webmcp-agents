---
description: "Replace any part of the chat with your own component: it gets the part's props, the catalog and the translate function."
---

# `ChatComponents`

The parts of `<AgentChat>` you can replace with a component of your own, passed as
[`components`](./agent-chat.md#props). Each replacement gets what the built-in part had (the call, the message, the
actions), the catalog and its translate function, and `partProps` to spread on its root so the hooks and the
accessibility attributes stay.

## Import

```ts
import type { ChatComponents, PartProps } from "@webmcp-agents/chat";
```

## Example

```tsx
const ToolCard: ChatComponents["ToolCard"] = ({ partProps, call, t }) => (
  <div {...partProps} className={`my-tool ${partProps.className ?? ""}`}>
    <strong>{call.tool}</strong>
    <span>{t("tool.running", { tool: call.tool })}</span>
  </div>
);

// outside the component that renders the chat, so it is not a new type each render
<AgentChat components={{ ToolCard }} />;
```

## Props

Every component also gets `PartProps`: `partProps` (`data-wa-part`, the part's classes and `styles` entry, and its state
attributes), `messages` (the merged catalog), `t` ([`Translate`](./create-translator.md)), and `children` where the
built-in part has content.

| Name | Type | Default | Description |
|---|---|---|---|
| `Launcher` | `{ open, toggle(), busy }` | the round button | Opens and closes the panel. |
| `Header` | `{ title, titleId, close(), reset(), canReset }` | title, New chat, Close | Put `id={titleId}` on your heading: the panel is labelled by it. |
| `Message` | `{ message }` | | One message; `children` are its rendered parts. |
| `Text` | `{ text, streaming }` | paragraphs | The person's and the model's text. Never render it as HTML. |
| `ToolCard` | `{ call, part }` | the card | `call` is a `WebAgentStep`, already [redacted](./redact-tool-call.md); `part` is the raw part; `children` is a sub-agent's nested run. |
| `Reasoning` | `{ text }` | not shown | The model's reasoning. The built-in chat shows none; pass one to show it. |
| `Suggestions` | `{ items, pick(text) }` | a list of buttons | Starter prompts. |
| `Composer` | `{ value, setValue(v), send(), stop(), busy, unavailable, inputRef }` | the message box | `unavailable` says why it is disabled (already worded), or is `null`. |
| `DownloadCard` | `{ status, bytes, start(), cancel(), useOther, otherLabel }` | the card | The on-device model's offer, progress or failure. |
| `ModelPicker` | `{ models, select(id), disabled }` | a native select | Shown when the adapter offers more than one model. |
| `Empty` | `{}` | the hint | `children` are the suggestions and the download card. |
| `Error` | `{ code, retry? }` | the alert | `retry` is absent when retrying cannot help (`chat_disabled`). Word it with the catalog's `errors.<code>`. |
| `Icon` | `{ name, size? }` | line icons | Every icon: `chat`, `close`, `send`, `stop`, `reset`, `down`, `restore`, `check`, `cancel`. |
| `Restore` | `{ message, confirming, ask(), confirm(), cancel() }` | an icon chip | The restore control under one user message. |

## Notes

- **Unstyled.** `unstyled` renders no `wa-chat*` class and writes no theme variable: only the `data-wa-part` hooks, your
  `classNames` and `styles`, and every role, label and key binding (Escape still closes; the arrow keys still resize and
  switch). Do not import `chat.css` then. Screen-reader-only text stays hidden with an inline style.
- **A replacement that throws** is an error in your tree like any other: it reaches your nearest error boundary. The
  page's tools are registered by the provider, not by the chat, so they keep working.
- Define replacements outside the component that renders the chat (module scope, or a `useMemo`): a new function each
  render is a new component type, and React remounts it.

## See also

- [Chat parts](./chat-parts.md)
- [`ChatMessages`](./chat-messages.md)
- [`<AgentChat>`](./agent-chat.md)
