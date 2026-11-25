---
description: "Render AgentChat for a test, open, with a mock adapter (0.5.0)."
---

# `renderChat`

Renders `<AgentChat>` open with a [`mockAdapter`](./mock-adapter.md) and gives back its host, for [`toHaveNoHardcodedText`](./to-have-no-hardcoded-text.md). It arrives with the chat's messages catalog (0.5.0): until then calling it fails with a sentence saying so; render `<AgentChat adapter={mockAdapter(…)} defaultOpen />` with `vitest-browser-react` meanwhile.

## Import

```ts
import { renderChat } from "@webmcp-agents/testing/chat";
```

## Example

```ts
const chat = await renderChat({ adapter: mockAdapter([text("Hi.")]) });
await expect(chat).toHaveNoHardcodedText();
```

## Options

`renderChat(options?)`.

| Name | Type | Default | Description |
|---|---|---|---|
| `adapter` | `AgentAdapter` | none | The adapter the chat runs. |
| `props` | `Record<string, unknown>` | none | `<AgentChat>`'s other props. |

## Returns

`Promise<RenderedChat>`: `host`, the chat's element.

## See also

- [`<AgentChat>`](../chat/agent-chat.md)
- [`mockAdapter`](./mock-adapter.md)
