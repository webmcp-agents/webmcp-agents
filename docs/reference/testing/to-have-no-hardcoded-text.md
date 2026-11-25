---
description: "The rendered chat shows no text that bypassed its messages catalog (0.5.0)."
---

# `toHaveNoHardcodedText`

The sentinel-catalog check as a matcher: renders every message of the chat from a catalog of markers and fails on any visible text that is not one. It arrives with the chat's messages catalog (0.5.0): until then it is typed and registered, and calling it fails with a sentence saying so.

## Import

```ts
import "@webmcp-agents/testing/matchers"; // in setupFiles (the main entry and ./setup register them too)
```

## Example

```ts
await expect(chat).toHaveNoHardcodedText();
```

## Options

`expect(received).toHaveNoHardcodedText()`.

| Name | Type | Default | Description |
|---|---|---|---|
| `received` | the value under test | required | What `expect(…)` was given; the matcher takes no arguments. |

## Returns

Nothing: it passes, or fails the test with a message that says what happened.

## See also

- [`renderChat`](./render-chat.md)
- [`<AgentChat>`](../chat/agent-chat.md)
