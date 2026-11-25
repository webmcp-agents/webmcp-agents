---
description: "Every string the chat shows, by key: English built in, any part overridable from an object or JSON, with placeholders, plurals and functions."
---

# `ChatMessages`

Every user-visible string of the chat, `aria-label`, `placeholder`, `title` and screen-reader announcement comes from
one catalog, `ChatMessages`; no string lives outside it. English is built in as `en`. Use
[`<AgentChat messages>`](./agent-chat.md#props) (or `useAgentChat({ messages })`) to change any of it, in any language:
a partial object at any depth, plain JSON included.

## Import

```ts
import { en } from "@webmcp-agents/chat";
import type {
  ChatMessages,
  ChatMessagesInput,
  Message,
  MessageKey,
} from "@webmcp-agents/chat";
```

## Example

```tsx
<AgentChat
  messages={{
    title: "Field Store assistant",
    composer: { placeholder: "Ask about an order" },
    tool: { awaitingConfirmation: "Click the highlighted button" },
    steps: "{count, plural, one {# step} other {# steps}}",
  }}
/>
```

The same from a JSON file, in Arabic, with a function where a template is not enough:

```json
{
  "locale": "ar",
  "messages": {
    "title": "مساعد المتجر",
    "steps": "{count, plural, zero {لا خطوات} one {خطوة واحدة} two {خطوتان} few {# خطوات} many {# خطوةً} other {# خطوة}}"
  }
}
```

## Options

A `ChatMessagesInput` is any part of `ChatMessages`; a key left out, or set to `null`, shows English.

| Name | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `"Assistant"` | The panel's heading. The `title` prop wins. |
| `launcher` | `{ open, close }` | "Open assistant" / "Close assistant" | The launcher's accessible name; `{title}` is the title. |
| `header` | `{ close, newChat }` | | The header's icon buttons. |
| `composer` | `{ placeholder, send, stop, label }` | | The message box and its buttons. |
| `empty` | `{ title, hint }` | | The empty conversation (`title` is empty, and then not shown). |
| `adapter` | `{ label, cloud, cloudNamed, onDevice, unavailable }` | | The adapter switcher and the built-in adapters' names. |
| `model` | `{ label, pick, recommended, cached, onDevice, sizeCached, sizeDownload, size }` | | The model picker. |
| `download` | 24 keys | | The on-device model: offer, download, load, failure. |
| `tool` | `{ running, awaitingConfirmation, done, failed, cancelled, confirmOnPage, showOnPage, agent, … }` | | A tool call's card; each state is a function of `{tool}`. |
| `subagent`, `reasoning`, `steps` | | | For custom parts (the built-in chat words a sub-agent with `tool.agent` and shows no reasoning). |
| `errors` | `Record<ChatErrorCode, string>` | | One text per [error code](./chat-error-codes.md). |
| `retry` | `string` | `"Try again"` | The error's button. |
| `live` | `{ thinking, answered, toolStarted, waitingForYou }` | | Screen-reader announcements. |
| `conversation` | `{ label, working, jumpToLatest }` | | The message list. |
| `status` | `{ connecting, needsDownload, notReady }` | | The line above the composer while the adapter gets ready. |
| `suggestions` | `{ label, fallback }` | | The starter prompts' list, and the one built-in prompt. |
| `resize` | `string` | `"Resize the assistant"` | The docked panel's resize handle. |
| `restore` | `{ button, hint, untitled, confirm, confirmQuestion, cancel, done }` | | Restore to before a message (0.4.0). |
| `trace` | 14 keys | | The [registry blocks](../../more/shadcn-chat-blocks.mdx)' trace lines. |

### Every key

| Key | English |
|---|---|
| `title` | "Assistant" |
| `launcher.open` | a function: "Open {title}", the title in lower case |
| `launcher.close` | a function: "Close {title}", the title in lower case |
| `header.close` | "Close assistant" |
| `header.newChat` | "New chat" |
| `composer.placeholder` | "Ask about this page" |
| `composer.send` | "Send" |
| `composer.stop` | "Stop" |
| `composer.label` | "Message the assistant" |
| `empty.title` | (empty: not shown) |
| `empty.hint` | "Ask me to do something on this page. You'll see each step happen, and anything that orders, books or deletes waits for your click." |
| `adapter.label` | "Assistant" |
| `adapter.cloud` | "Cloud" |
| `adapter.cloudNamed` | "{model} (cloud)" |
| `adapter.onDevice` | "On this device" |
| `adapter.unavailable` | "Not available here" |
| `model.label` | "Model" |
| `model.pick` | "Choose a model" |
| `model.recommended` | "{model} (recommended)" |
| `model.cached` | "{model} · on this device" |
| `model.onDevice` | "On this device" |
| `model.sizeCached` | "{size}, on this device" |
| `model.sizeDownload` | "{size} download" |
| `model.size` | "{formatted}" |
| `download.offer` | "Run the assistant on this device" |
| `download.size` | "Downloads {size} once." |
| `download.sizeUnknown` | "Needs a one-time download." |
| `download.privacy` | "Nothing you type leaves your browser." |
| `download.start` | "Download" |
| `download.useOther` | "Use {adapter} instead" |
| `download.otherFallback` | "another assistant" |
| `download.title` | "Downloading the model…" |
| `download.loadingTitle` | "Loading the model from this device…" |
| `download.starting` | "Starting the model on this device…" |
| `download.firstStart` | "The first start can take a few minutes." |
| `download.alreadyHere` | "Nothing to download: the files are already here." |
| `download.downloading` | "Downloading the model… {formatted}" |
| `download.loading` | "Loading the model… {formatted}" |
| `download.progress` | "{formatted}" |
| `download.progressBytes` | "{formatted} · {done} of {total}" |
| `download.label` | "Model download" |
| `download.loadingLabel` | "Model loading" |
| `download.cancel` | "Cancel" |
| `download.failed` | "The download didn't finish" |
| `download.loadFailed` | "The model couldn't load" |
| `download.retry` | "Try again" |
| `download.ready` | "The model is ready." |
| `tool.running` | "Working" |
| `tool.awaitingConfirmation` | "Waiting for you" |
| `tool.done` | "Done" |
| `tool.failed` | "Failed" |
| `tool.cancelled` | "Cancelled" |
| `tool.confirmOnPage` | "Confirm on the page to continue." |
| `tool.showOnPage` | "Show me" |
| `tool.agent` | "{agent} agent" |
| `tool.input` | "Input" |
| `tool.output` | "Result" |
| `tool.showDetails` | "Show details" |
| `tool.hideDetails` | "Hide details" |
| `subagent.working` | "The {agent} agent is working" |
| `subagent.finished` | "The {agent} agent finished" |
| `reasoning.thinking` | "Thinking" |
| `reasoning.show` | "Show reasoning" |
| `reasoning.hide` | "Hide reasoning" |
| `steps` | "{count, plural, one {# step} other {# steps}}" |
| `errors.chat_disabled` | "Chat isn't configured on this site." |
| `errors.rate_limited` | "You're sending messages too fast. Try again in a minute." |
| `errors.daily_limit` | "This demo has reached its daily limit. Try again tomorrow, or try the on-device assistant." |
| `errors.bad_request` | "The assistant couldn't read this conversation. Start a new chat." |
| `errors.network` | "Couldn't reach the assistant. Check your connection and try again." |
| `errors.session` | "Couldn't start a chat session. Reload the page and try again." |
| `errors.busy` | "The assistant is busy. Try again in a moment." |
| `errors.max_steps` | "The assistant stopped at its step limit before finishing. Try again to let it continue." |
| `errors.aborted` | "The agent run was aborted." |
| `errors.run_failed` | "The agent run failed." |
| `errors.unknown` | "Something went wrong. Try again." |
| `retry` | "Try again" |
| `live.thinking` | "The assistant is working" |
| `live.answered` | "The assistant answered" |
| `live.toolStarted` | "Working: {tool}" |
| `live.waitingForYou` | "Waiting for you: {tool}. Confirm on the page to continue." |
| `conversation.label` | "Conversation" |
| `conversation.working` | "The assistant is working" |
| `conversation.jumpToLatest` | "Jump to latest" |
| `status.connecting` | "Connecting to the assistant…" |
| `status.needsDownload` | "Download the model to start." |
| `status.notReady` | "The model isn't ready yet." |
| `trace.running` | "Running {tool}…" |
| `trace.waiting` | "Waiting for you: {tool}" |
| `trace.done` | "Ran {tool}" |
| `trace.doneNote` | "done" |
| `trace.cancelled` | "Cancelled {tool}" |
| `trace.failed` | "Failed to run {tool}" |
| `trace.confirmTitle` | "Confirm on the page" |
| `trace.confirmFallback` | "{tool}: click to confirm." |
| `trace.agentRunning` | "Running the {agent} agent…" |
| `trace.agentDone` | "Ran the {agent} agent" |
| `trace.agentCancelled` | "Cancelled the {agent} agent" |
| `trace.agentFailed` | "The {agent} agent failed" |
| `trace.agentBadge` | "agent" |
| `trace.thought` | "Thought" |
| `suggestions.label` | "Suggestions" |
| `suggestions.fallback` | "What can you do on this page?" |
| `resize` | "Resize the assistant" |
| `restore.button` | "Restore to before: {message}" |
| `restore.hint` | "Restore to before this message" |
| `restore.untitled` | "Message" |
| `restore.confirm` | "Remove this turn and everything after" |
| `restore.confirmQuestion` | "Remove this turn and everything after?" |
| `restore.cancel` | "Cancel" |
| `restore.done` | "Restored — edit and send again." |

## Returns

`en` is a complete `ChatMessages`. `MessageKey` is the union of every dotted path (`"composer.send"`,
`"errors.network"`), what [`createTranslator`](./create-translator.md)'s `t` takes.

## Notes

- **Placeholders.** `{name}` is replaced by the value the chat supplies (`{tool}`, `{title}`, `{size}`, `{formatted}`…);
  a number is formatted for the locale. A placeholder with no value becomes empty, never `undefined`.
- **Plurals.** `{count, plural, zero {…} one {…} two {…} few {…} many {…} other {…}}` picks the form by the locale's
  plural rules (`Intl.PluralRules`); `=0 {…}` matches an exact number first, and `#` is the localized number.
  Malformed plural syntax (no `other`, a missing brace) is shown as written, never thrown.
- **Functions.** `Message<V>` is a string or `(values: V) => string`, for word order a template cannot express. A
  function that throws, or returns something other than a string, shows the English text and logs a warning; the
  chat keeps working.
- **Shipped locales.** Arabic and Spanish are separate entries: [`@webmcp-agents/chat/locales/ar`, `/es`](./locales.md).
- **What is not here.** The model's and the person's words, tool names, a tool's own result and prompt, an adapter's own
  label and the page's suggestions are data, shown as they are. Text the handler writes for the model has its own
  option: [`createChatHandler({ messages })`](./create-chat-handler.md#options).

## See also

- [`createTranslator`](./create-translator.md), to read the catalog in your own UI
- [`defineChatMessages`](./define-chat-messages.md)
- [Locales](./locales.md)
- [Chat error codes](./chat-error-codes.md)
