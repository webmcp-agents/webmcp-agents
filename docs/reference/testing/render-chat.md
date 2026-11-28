---
description: "Render AgentChat for a test, open, with a mock adapter; with the sentinel catalog, every string the chat owns is a marker."
---

# `renderChat`

Renders `<AgentChat>` open for a browser-mode test, with a [`mockAdapter`](./mock-adapter.md), and gives back its root
and a way to find any [part](../chat/chat-parts.md). With `sentinel: true`, every entry of the chat's catalog is a
`⟦marker⟧`, so [`toHaveNoHardcodedText`](./to-have-no-hardcoded-text.md) can prove no string bypassed it.

## Import

```ts
import { renderChat, sentinelMessages, SENTINEL } from "@webmcp-agents/testing/chat";
import type { RenderChatOptions, RenderedChat } from "@webmcp-agents/testing/chat";
```

## Example

```ts
const chat = await renderChat({ adapter: mockAdapter([text("Hi.")]), sentinel: true });
await userEvent.type(chat.part("input")!, "Hello{Enter}");
await expect(chat).toHaveNoHardcodedText({ allow: ["Hello", "Hi."] });
```

## Options

`renderChat(options?)`. Every option is optional.

| Name | Type | Default | Description |
|---|---|---|---|
| `adapter` | `AgentAdapter` | one that is always ready and answers nothing | The adapter the chat runs: a `mockAdapter` for a scripted run. |
| `props` | `Partial<AgentChatProps>` | — | `<AgentChat>`'s other props (`messages`, `locale`, `theme`, `components`…). `defaultOpen` and `storageKey: false` are set for you; these win. |
| `sentinel` | `boolean` | `false` | Render with the sentinel catalog (`⟦composer.send⟧`…), laid under `props.messages`. |
| `wrapper` | `(props: { children }) => unknown` | — | Wrap the chat: a `<WebAgentsProvider>`, an error boundary. |
| `timeout` | `number` | `2000` | Ms to wait for the chat to mount before failing with a sentence. |

## Returns

`Promise<RenderedChat>`:

| Name | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The chat's root (`data-wa-part="root"`). |
| `panel` | `HTMLElement` | The panel. |
| `part(name)` | `(name: string) => HTMLElement \| null` | The first element of that part. |
| `parts(name)` | `(name: string) => HTMLElement[]` | Every element of that part. |
| `rerender(props)` | `(props) => Promise<void>` | Render again with these props merged over the first ones. |
| `unmount()` | `() => void` | Take it down now (it is taken down after the test anyway). |
| `messages` | `ChatMessagesInput` | The sentinel catalog, when `sentinel` was set. |

## Notes

- Needs a page (a `*.browser.test` file) and React DOM; it fails with a sentence otherwise.
- `sentinelMessages()` builds the sentinel catalog on its own; `SENTINEL` is the marker pattern (`/⟦[\w.]+⟧/g`).

## See also

- [`toHaveNoHardcodedText`](./to-have-no-hardcoded-text.md)
- [`mockAdapter`](./mock-adapter.md)
- [`<AgentChat>`](../chat/agent-chat.md) and [Chat parts](../chat/chat-parts.md)
