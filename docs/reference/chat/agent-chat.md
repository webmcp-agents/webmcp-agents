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
| `title` | `string` | `"Assistant"` | Panel title. Also used in the launcher's label ("Open assistant"). |
| `defaultOpen` | `boolean` | `false` | Open on first render. |
| `position` | `"bottom-right" \| "bottom-left"` | `"bottom-right"` | Side and corner for the launcher and panel. |
| `layout` | `"docked" \| "floating"` | `"docked"` | `"docked"`: beside the page, full height, resizable; the page makes room. `"floating"`: a pop-over in the corner. |
| `suggestions` | `string[] \| false` | derived from the page's tools | Starter prompts for an empty conversation. `false` hides them. |
| `className` | `string` | — | Extra class on the host element, for theming with the `--wa-chat-*` properties. |
| `storageKey` | `string \| false` | `"web-agents:chat"` | sessionStorage key for the conversation. Whether the panel is open is kept next to it (`<key>:open`), so after a page load (a navigation made without the app's router, a reload) the chat comes back as it was. `false` keeps both in memory only. |

## Returns

A portal into a host `<div>` appended to `document.body` (class `wa-chat`, `data-position`, `data-layout` and the `data-web-agents-ui` attribute). It renders `null` until the host exists.

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
layer. Override the custom properties on `.wa-chat` (or on your `className`):

| Property | Default (light) |
|---|---|
| `--wa-chat-bg` | `#ffffff` |
| `--wa-chat-fg` | `#111111` |
| `--wa-chat-muted` | `#5f6368` |
| `--wa-chat-line` | `rgba(17, 17, 17, 0.1)` |
| `--wa-chat-soft` | `rgba(17, 17, 17, 0.05)` |
| `--wa-chat-accent` | `var(--agent, #111111)` (the cursor's colour) |
| `--wa-chat-accent-ink` | `var(--agent-ink, #ffffff)` |
| `--wa-chat-danger` | `#c62828` |
| `--wa-chat-success` | `#1b7f3b` |
| `--wa-chat-radius` | `14px` |
| `--wa-chat-shadow` | `0 12px 40px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.08)` |
| `--wa-chat-font` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `--wa-chat-ease` | `var(--agent-ease-out, cubic-bezier(0.22, 1, 0.36, 1))` |
| `--wa-chat-z` | `calc(var(--agent-z, 2147483000) - 2)` (below the agent cursor) |
| `--wa-chat-gap` | `20px` (`16px` below 640 px) |

Dark mode follows `prefers-color-scheme` (unless an ancestor or the host has `data-theme="light"`), or
`data-theme="dark"` on an ancestor or the host. It changes the surfaces, and the accent with them: in dark,
`--wa-chat-accent` is a light tint of `--agent` (its lightness raised to at least 0.8 in OKLCH, hue kept) and
`--wa-chat-accent-ink` is the panel's background, so the default near-black agent stays readable on the dark panel.
Browsers without relative colour syntax use the panel's text colour as the accent. The dark rules are two selectors
deep: an override of your own for dark needs the same condition (`[data-theme="dark"] .wa-chat`, or the media query).

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
- "Try again" after a failed run resumes the turn (see [`resumable`](./session-reducer.md#resumable)). It is hidden for
  `chat_disabled`.
- Each user message offers **Restore** (hover or focus): the first click asks for confirmation; **Confirm restore**
  then calls [`session.restore`](./use-agent-session.md#restore), truncates the thread to before that message, reverses
  completed tools best-effort, and puts the dropped text back in the composer. Works while a run is streaming (it stops
  first).
- Escape closes the panel and returns focus to the launcher.

## See also

- [Add the chat](../../build/add-the-chat.mdx), the page that teaches it
- [`defineWebAgent`](./define-web-agent.md), the `agent` prop
- [`createCloudAdapter`](./create-cloud-adapter.md) and [`createChatHandler`](./create-chat-handler.md), the two ends of `/api/chat`
- [`useAgentSession`](./use-agent-session.md), to build your own chat UI
- [`useWebAgent`](./use-web-agent.md), to run an agent with no chat on the page
- [Adapter types](./adapter-types.md)
- [`createLocalAdapter`](../local-agent/create-local-adapter.md)
