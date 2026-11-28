---
description: "A chat launcher and a non-modal chat panel whose agent works the live page through its tools while the person watches."
---

# `AgentChat`

A chat launcher and a non-modal chat panel whose agent works the live page through its tools while the person watches. Use it to give a page an assistant in one line; by default the panel docks beside the page instead of covering it.

## Import

```ts
import { AgentChat } from "@webmcp-agents/chat";
import type { AgentChatProps } from "@webmcp-agents/chat";
import "@webmcp-agents/chat/chat.css";
```

## Example

<include meta='title="components/page.tsx"'>/_examples/shared/reference/chat/agent-chat.tsx</include>

With a cloud and an on-device adapter, the person picks in a switcher. Create the adapters once, at module scope:

```ts
import { createCloudAdapter } from "@webmcp-agents/chat";
import { createLocalAdapter } from "@webmcp-agents/local-agent";

const adapters = [
  createCloudAdapter(),
  createLocalAdapter({ instructions: "Help with the store." }),
];
// <AgentChat adapters={adapters} agent={shopper} />
```

## Props

| Name | Type | Default | Description |
|---|---|---|---|
| `adapter` | `AgentAdapter` | one shared `createCloudAdapter()` | What runs the model. Left out (with no `adapters`), the panel uses one shared cloud adapter that POSTs to `/api/chat`, the same one [`agent.invoke`](./define-web-agent.md#agentinvoke) and [`useWebAgent`](./use-web-agent.md) use. |
| `adapters` | `readonly AgentAdapter[]` | — | Several adapters (cloud, on-device…). The panel shows a switcher; the first is the default. An empty list falls back to the default adapter. |
| `agent` | `WebAgent` | — | The page's agent ([`defineWebAgent`](./define-web-agent.md)): its instructions, the tools it may use, its sub-agents. Register the same definition on the server (`createChatHandler({ agents })`). A delegate call renders as "<Name> agent" with the sub-agent's cards nested inside. |
| `title` | `string` | the catalog's `title` (`"Assistant"`) | Panel title. Also used in the launcher's label ("Open assistant"). Wins over `messages.title`. |
| `defaultOpen` | `boolean` | `false` | Open on first render. |
| `position` | `"bottom-right" \| "bottom-left"` | `"bottom-right"` | Side and corner for the launcher and panel. |
| `layout` | `"docked" \| "floating"` | `"docked"` | `"docked"`: beside the page, full height, resizable; the page makes room. `"floating"`: a pop-over in the corner. |
| `suggestions` | `string[] \| false` | derived from the page's tools | Starter prompts for an empty conversation. `false` hides them. |
| `className` | `string` | — | Extra class on the host element, for theming with the `--wa-chat-*` properties. Same as `classNames.root`. |
| `storageKey` | `string \| false` | `"web-agents:chat"` | sessionStorage key for the conversation. Whether the panel is open is kept next to it (`<key>:open`), so after a page load (a navigation made without the app's router, a reload) the chat comes back as it was. `false` keeps both in memory only. |
| `getSnapshot` | `() => unknown` | — | Optional JSON-serializable app state (cart, selection, …) captured per user turn and persisted with the chat. The URL is stored on the message automatically. |
| `applySnapshot` | `(snapshot: { url?: string; app?: unknown }) => void \| Promise<void>` | default `history.replaceState` + `popstate` for `url` | Reapply a stage's checkpoint once the fills are rewound; with it, no tool `revert` runs. SPA apps should call their router (`navigate(url)`) and rehydrate store state from `app` (leave orders and bookings out: a restore never goes past a confirmed one). |
| `theme` | `ChatThemeInput` | the built-in palette | CSS variable values as data: one [`ChatTheme`](./chat-theme.md), or `{ light, dark }`. Applied on the chat's root only. Ignored with `unstyled`. |
| `colorScheme` | `"auto" \| "light" \| "dark"` | `"auto"` | `"auto"` is 0.4.0's behavior: `data-theme="dark"` on the chat or an ancestor forces dark, `data-theme="light"` on the chat forces light, else the OS. `"light"` / `"dark"` set `data-theme` on the chat's root. |
| `messages` | `ChatMessagesInput` | English | Any part of the [message catalog](./chat-messages.md), as an object or plain JSON (placeholders, plurals, functions). Missing keys stay English. [Locales](./locales.md) ship separately. |
| `locale` | `string` | `<html lang>`, else `"en"` | BCP 47. Drives plural rules, number, byte and percent formatting, and the direction. An invalid tag is `"en"`. |
| `dir` | `"ltr" \| "rtl"` | from `locale`, else `<html dir>`, else `"ltr"` | Text direction. Arabic, Hebrew, Persian and Urdu locales are `"rtl"`; the layout mirrors (the dock side too). |
| `classNames` | `Partial<Record<ChatPart, string>>` | — | Extra classes per [part](./chat-parts.md), added after the built-in ones. |
| `styles` | `Partial<Record<ChatPart, CSSProperties>>` | — | Inline styles per part. |
| `components` | `Partial<ChatComponents>` | — | Your own components in place of [parts](./chat-components.md) (`ToolCard`, `Composer`, `Icon`…). |
| `unstyled` | `boolean` | `false` | No library styling: no `wa-chat*` class and no theme variable; only the `data-wa-part` hooks, your classes and styles, and every role, label and key binding. Do not import `chat.css` then. |

## Returns

A portal into a host `<div>` appended to `document.body` (class `wa-chat`, `data-wa-part="root"`, `data-position`,
`data-layout`, `dir`, `lang` and the `data-web-agents-ui` attribute). It renders `null` until the host exists. Every
element inside carries `data-wa-part` and its state as data attributes ([Chat parts](./chat-parts.md)).

### Layout

- **Docked** (default): the open panel sits on the `position` side, full height, and the page gets a body margin so
  the agent never works under the chat. Drag the inner edge, or focus it and use the arrow keys (Shift for bigger
  steps, Home and End for min and max), to resize. The width runs from 320 px up to the window minus 360 px (at most
  720 px), starts at 380 px, and is remembered in localStorage.
- While docked, `<html>` gets `data-wa-chat-dock="left|right"` and `--wa-chat-inset-left` / `--wa-chat-inset-right`.
  Offset your own fixed UI (drawers, toasts) with them.
- **Floating**: the pop-over stays in the corner, over the page.
- Below 640 px the panel is a bottom sheet in either layout.

### Theming

Import `@webmcp-agents/chat/chat.css` once. Every rule is scoped by a `.wa-chat*` class and sits outside any cascade
layer, so an app's plain `button { color: inherit }` never beats it. Every color, size, radius, shadow, duration and
z-index is a `--wa-chat-*` variable ([`ChatTheme`](./chat-theme.md) lists them all with their defaults): set it anywhere
above the chat (`:root` works), or pass `theme`.

```css
:root {
  --wa-chat-color-accent: oklch(0.62 0.19 255);
  --wa-chat-radius-panel: 20px;
}
```

The 0.4.0 names (`--wa-chat-accent`, `-accent-ink`, `-bg`, `-fg`, `-muted`, `-soft`, `-line`, `-danger`, `-success`,
`-radius`, `-shadow`, `-font`, `-ease`, `-z`, `-gap`, `-width`, `-inset-left`, `-inset-right`) are still declared on
`.wa-chat` as before, and each feeds its new token: a page that set them keeps what it had.

Dark mode follows `prefers-color-scheme` (unless the host has `data-theme="light"`), or `data-theme="dark"` on an
ancestor or the host; `colorScheme` forces one. It changes the surfaces, and the accent with them: in dark, the accent
is a light tint of `--agent` (its lightness raised to at least 0.8 in OKLCH, hue kept) with the panel's background as
its ink, so the default near-black agent stays readable on the dark panel. Browsers without relative colour syntax use
the panel's text colour as the accent.

A worked example, with the cursor: [Style the cursor and the chat](/build/style-the-cursor-and-chat).

## Notes

- Render it inside `<WebAgentsProvider>` so the agent sees the tools the page has on.
- Create custom adapters once, at module scope, not during render: the session and the status hook key on the adapter object.
- The host carries `data-web-agents-ui`, so typing in the chat never makes the agent cursor yield.
- The conversation survives route changes and reloads (sessionStorage, last 60 messages). A reload marks any running
  tool call as cancelled.
- The chosen adapter is remembered in localStorage (`web-agents:chat:adapter`) while it is still offered. The switcher
  is disabled while a run streams.
- An adapter with `prepare()` and a `needs-download`, `downloading` or `error` status shows a download card with the
  size, Cancel, and a button to switch to another adapter.
- A failed run shows the catalog's text for its [error code](./chat-error-codes.md), never the server's English. "Try
  again" resumes the turn (see [`resumable`](./session-reducer.md#resumable)); it is hidden for `chat_disabled`. A turn
  cut short by the step limit shows `max_steps`, with Try again to let it continue.
- Every string, label and announcement comes from the [message catalog](./chat-messages.md); a tool parked on the page
  is announced to screen readers (`live.waitingForYou`).
- User messages that already have a reply (or a later turn) show a restore icon under the bubble, unless a confirmed
  action (a finished `requireConfirmation` or `destructive` call: an order placed, a flight booked) comes at or after
  them. The icon asks to confirm with a check and a cross (their tooltips and accessible names carry the words: “Remove
  this turn and everything after”, “Cancel”); confirming calls [`session.restore`](./use-agent-session.md#restore),
  truncates the thread, rewinds the page best-effort, reapplies that turn's URL / app snapshot, puts the dropped text in
  the composer (before anything already typed there), and shows a short “Restored — edit and send again.” status.
  Works while a run is streaming (it stops first); a message sent while the page is being restored stays in the
  composer.
- Escape closes the panel and returns focus to the launcher.

## See also

- [Add the chat](../../build/add-the-chat.mdx), the page that teaches it
- [`defineWebAgent`](./define-web-agent.md), the `agent` prop
- [`createCloudAdapter`](./create-cloud-adapter.md) and [`createChatHandler`](./create-chat-handler.md), the two ends of `/api/chat`
- [`ChatTheme`](./chat-theme.md), [`ChatMessages`](./chat-messages.md), [Chat parts](./chat-parts.md) and [`ChatComponents`](./chat-components.md), to change how it looks and reads
- [`useAgentSession`](./use-agent-session.md), to build your own chat UI
- [`useWebAgent`](./use-web-agent.md), to run an agent with no chat on the page
- [Adapter types](./adapter-types.md)
- [`createLocalAdapter`](../local-agent/create-local-adapter.md)
