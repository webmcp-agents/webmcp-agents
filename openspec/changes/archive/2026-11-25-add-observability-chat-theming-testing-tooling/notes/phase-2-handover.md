# Phase 2 (testing kit): hand-over for phases 3, 4 and 5

Written by the phase-2 session. Notes, not instructions: the code is the source of truth. Write your phase test-first on
the kit: `import { expect, test } from "@webmcp-agents/testing"` in a package's tests resolves the kit's source.

## Where things are (packages/testing/src)

| File | What |
|---|---|
| `test.ts` | `test` = `base.extend<WebAgentsFixtures>`: `tools`, `events`, `user`, `mount`, `redactor`, and the `runs` / `spans` shells |
| `matchers.ts` | `expect.extend(webAgentsMatchers)` + `declare module "vitest" { interface Matchers<R, T> extends WebAgentsMatchers<R> }`; one matcher per file in `matchers/` (konsistent: the file exports the camelCase of its name; no other file may live there) |
| `format.ts` | readers (`readToolResult`, `readEvents`), wording helpers (`hint`, `show`, `listEvents`), `MatcherInputError` (thrown for a value a matcher cannot read, so it fails under `.not` too) |
| `run-record.ts` | `readRun` (WebAgentResult, mockAdapter via `RUN_RECORD`, the rejected Error), `RunRecord` |
| `setup.ts` + `guard.ts` | polyfill, reduced motion (CDP, stub fallback; `provide.webAgentsMotion`), ids (`ids.ts`), cleanup, and the leak checks (`endTest`) |
| `vitest.ts` | `webAgentsProject`; no relative imports on purpose (repo configs load it from source) |
| `chat/` | `mockAdapter`, `mockChatServer`, `renderChat` (shell); `script.ts` has the steps (`text`, `toolCall`, `reasoning`, `fail`) shared with `server/mock-model.ts` |
| `server/` | `mockModel`, `chatRequest`, `readChatStream`, `withSession` |
| `not-yet.ts` | `notYet(feature, part)`: the sentence every shell throws. Remove a `PendingPart` when its phase lands |

## Shells, and exactly what each phase fills in

### Phase 3 (chat customization)
- `src/chat/render-chat.ts` `renderChat(options)`: render `<AgentChat adapter={…} defaultOpen {...props} />` (React DOM or
  `vitest-browser-react`; add it back as a devDependency: it is an optional peer already, removed from devDependencies
  because knip found it unused) and return `{ host }` (more fields are fine; `RenderedChat` is yours to extend).
- `src/matchers/to-have-no-hardcoded-text.ts`: the sentinel-catalog check of design §5.4, async (`await expect(chat)…`).
  Keep the failure worded (which text, where).
- Update `test/not-yet.test.ts` (it asserts these shells), and `docs/reference/testing/render-chat.md`,
  `to-have-no-hardcoded-text.md` (pages are generated-looking but hand-editable now; the generator is not in the repo).

### Phase 4 (run telemetry in chat)
- `src/test.ts` `runs` fixture: record every `AgentRunEvent` (onAgentRun) for the test; `RunLog` (in the same file) is
  yours to shape (`events` is the only member now).
- `src/run-record.ts` `readRun`: it throws "cannot read a RunLog yet" for any `{ events }`; read a RunLog there (calls,
  answer, finish, and `max-steps` vs `stop`, which a `WebAgentResult` cannot tell: today it reads as `"stop"`, documented
  in `toHaveFinishedWith`'s page).
- Usage: `Step.usage` is typed and `mockModel` already sends it to the AI SDK; `mockAdapter` does not emit it (no
  `AgentStreamPart` carries usage yet). Emit it once the part exists.
- Ids: chat's `newId` reads `globalThis[Symbol.for("web-agents.ids")]` (`packages/chat/src/shared.ts`); `./setup`
  installs a per-test sequence (`u-1`, `a-1`, `call-1`). Make run ids go through `newId("run")` and they are
  deterministic in tests for free.
- `mockChatServer.requests[n].body.trace` will carry the ids the browser sends as soon as the cloud adapter sends them.

### Phase 5 (@webmcp-agents/telemetry)
- `packages/testing/package.json`: add `"@webmcp-agents/telemetry": "workspace:^"` to `peerDependencies` +
  `peerDependenciesMeta` (optional). It is not there now: pnpm tries to resolve an optional peer and fails while the
  package does not exist. Add a devDependency too if the kit's own tests need it.
- `src/telemetry/index.ts`: `memoryExporter()` (`spans`, `reset`), `spanTree(spans)`; consider a top-level
  `requirePeer` for `@webmcp-agents/telemetry` like `./chat` does (`src/peer.ts`).
- `src/test.ts` `spans` fixture (`observeAgents` wired to memory); `src/matchers/to-have-span.ts`, `to-be-one-trace.ts`.
- `toContainSensitive` reads any value by walking it, so a `MemoryExporter` works as is; give it a sink name of its own
  in `scan()` if the message should say "the spans".
- `docs/_examples/testing/privacy.browser.test.tsx`: add `runs` and `spans` to the sinks (phase 6 writes the page).

## Contracts later phases can rely on
- The browser setup fails a test that leaves a tool call running or a tool registered (names the tool), after a grace
  (1 s for calls, 2 s for deferred releases). A `beforeAll` tool belongs to the file. Visuals a test installs itself
  are its own to `destroy()`; `mount` unmounts React roots (a provider releases its cursor and tools).
- "No WebMCP" pages: a project with `setupFiles: ["@webmcp-agents/testing/matchers"]` (see core/devtools/react configs).
- Core's browser tests keep full motion (`motion: "full"`); every other package runs reduced (the cursor snaps).
- `mockAdapter(script)`: steps across runs, or a function per model step that may return a whole stream (raw
  generators: the old `fakeAdapter`s). `requests` are copies (messages cloned).
- Repo configs import `../testing/src/vitest.ts` (Vite loads configs with Node's resolution; source condition absent);
  `tsconfig.base.json` has `allowImportingTsExtensions` for it.
- `@webmcp-agents/testing` is a root devDependency only: a package devDependency makes a Turbo `build` cycle
  (core ↔ testing), checked.
