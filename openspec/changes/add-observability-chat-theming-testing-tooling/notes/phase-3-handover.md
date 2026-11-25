# Phase 3 (chat customization): hand-over for phases 4, 5 and 6

Written by the phase-3 session. Notes, not instructions: the code is the source of truth.

## Where things are (packages/chat/src)

| File | What |
|---|---|
| `customize/types.ts` | `ChatPart` (from `CHAT_PARTS`), `ChatTheme`, `ChatThemeInput`, `Message<V>`, `ChatErrorCode`, `ChatMessages`, `ChatMessagesInput`, `MessageKey`, `Translate`, `ChatFormat`, `PartProps`, `ChatComponents`, `ChatCustomization` |
| `customize/parts.ts` | `CHAT_PARTS`: 38 design parts + 30 the inventory found (68) |
| `customize/tokens.ts` | `THEME_GROUPS` (one list feeds the type, `themeToCssVars` and the CSS test), `THEME_TOKENS`, `tokenVar` |
| `customize/en.ts` | `en`, the English catalog (0.4.0's words; `launcher.open/close` are functions that lower-case the title) |
| `customize/translate.ts` | `createTranslator`, `deepMerge`, `safeLocale`, `directionOf`, `createFormat` |
| `customize/theme.ts` | `themeToCssVars`, `isSchemedTheme`, `schemedThemeCss` (the `{ light, dark }` stylesheet), `defineChatTheme`, `defineChatMessages` |
| `customize/errors.ts` | `CHAT_ERROR_CODES`, `chatErrorCode` (server-only codes → `unknown` / `busy`) |
| `customize/context.tsx` | `ChatProvider`, `useChatContext`, `partAttrs` / `usePart` (data-wa-part + class + style), `slotProps`, `SR_ONLY` |
| `locales/ar.ts`, `locales/es.ts` | separate entries (`./locales/ar`, `./locales/es` in package.json and tsdown) |
| `server/messages.ts` | `ChatServerMessages`, `SERVER_MESSAGES`, `serverMessages()` (the handler's `messages` option) |

## Final shapes

- `ChatMessages` groups: `title`, `launcher`, `header`, `composer`, `empty`, `adapter`, `model`, `download`, `tool`,
  `subagent`, `reasoning`, `steps`, `errors`, `retry`, `live`, `conversation`, `status`, `suggestions`, `resize`,
  `restore`, `trace` (the registry blocks' lines). Beyond the design: `model.{onDevice,sizeCached,sizeDownload,cached,
  recommended,size}` worded as 0.4.0, `download.*` (24 keys: every download/load string), `tool.{confirmOnPage,
  showOnPage,agent}`, `retry`, `conversation.jumpToLatest`, `status.notReady`, `restore.{untitled,confirmQuestion,done}`,
  `trace.*`. A key the chat adds must be added to `en`, `ar`, `es` (`satisfies ChatMessages` makes it a type error) and
  to `test/locales.test.ts` passes on its own.
- `ChatComponents`: `Launcher`, `Header`, `Message`, `Text`, `ToolCard`, `Reasoning`, `Suggestions`, `Composer`,
  `DownloadCard`, `ModelPicker`, `Empty`, `Error`, `Icon`, `Restore`. Each receives `PartProps` (`partProps`,
  `messages`, `t`, `children`). Props beyond the design: `Launcher.busy`, `Header.{title,titleId,canReset}`,
  `ToolCard.part`, `Composer.{unavailable,inputRef}`, `DownloadCard.{bytes,useOther,otherLabel}`, `ModelPicker.disabled`.
- `AgentAdapter.labelParts?` (new, optional): `{ kind: "cloud" | "on-device"; model? }`; the cloud adapter sets it unless
  given `label`. `AdapterStatus.unavailable.code?` (new): a `ChatErrorCode`.

## The error-code flow

1. `adapter/cloud.ts` `failure()` derives the code from status + body (`fail(code)` = `{ type: "error", code, error:
   en.errors[code] }`); `unavailable(code)` for the status. A model error mid-stream (wire.ts `readParts`) has no code.
2. `session/run-agent.ts` `result()`: `code: chatErrorCode(error.code)`; a throw → `run_failed`; abort → `code:
   "aborted"` on `RunAgentResult` (the thrown `AbortError` of `invokeAgent` is unchanged: DOMException owns `code`).
   `invokeAgent` rejects with `Error(message)` + `code` (default `run_failed`).
3. `session/reducer.ts`: `finish` with `max-steps` → `status: "error"`, `error: { code: "max_steps" }` (new visible
   message); `error` parts keep `{ message, code }`.
4. UI: `AgentChat` shows `t(errors.<chatErrorCode(code)>)`; `useAgentChat` returns `error: { ...SessionError, code,
   text }` and `t`.
5. Server: `createChatHandler({ messages })` → `serverMessages()`; used for the tool-budget note, `notOnPage` in
   `onError`, and the 500's message. Handler edits are 4 lines (`const text = serverMessages(opts.messages)`).

## For phase 4 (run telemetry)

- `step-finish` / run events: hook them in `runAgent` (`report()` is the single place every part passes, nested ones
  with `within`) and in `adapter/cloud.ts` where `step-finish` is yielded; nothing of phase 3 sits in those loops.
- Adding `usage` to `AgentStreamPart` is additive; the reducer's `applyPart` must keep a `case` for it (exhaustive switch).
- If run events need a visible string, add a catalog key (and to `ar`, `es`) and a state to
  `test/no-hardcoded-strings.browser.test.tsx` (it fails on any element without `data-wa-part`).
- `RunAgentResult.code` is a `ChatErrorCode` now; an `AgentRunEvent` error can carry it as is.

## For phase 6 (docs)

- Reference pages exist for every new export (chat-theme, theme-to-css-vars, define-chat-theme, chat-messages,
  define-chat-messages, create-translator, locales, chat-parts, chat-components, chat-error-codes, adapter-label;
  testing render-chat, to-have-no-hardcoded-text). The guide pages ("Style the cursor and the chat", a customization
  guide) are yours; `docs/reference/chat/agent-chat.md` "Theming" now points at the tokens.
- `check-docs.mjs` OPTION_TYPES has `ChatCustomization`, `ChatTheme`, `ChatComponents`, `RenderChatOptions`,
  `NoHardcodedTextOptions`.

## Testing kit

- `renderChat({ adapter, props, sentinel, wrapper, timeout })` → `{ host, panel, part, parts, rerender, unmount,
  messages }`; `sentinelMessages()`, `SENTINEL`. `toHaveNoHardcodedText({ allow })` is synchronous (awaiting it works).
  The `chat-theming` `PendingPart` is gone.
