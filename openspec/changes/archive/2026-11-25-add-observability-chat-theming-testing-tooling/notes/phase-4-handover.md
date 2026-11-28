# Phase 4 (run telemetry in chat): hand-over for phases 5 and 6

Written by the phase-4 session. Notes, not instructions: the code is the source of truth.

## Where things are

| File | What |
|---|---|
| `packages/chat/src/session/run-events.ts` | `RunRef`, `StepUsage`, `AgentRunEvent`, `onAgentRun(listener, { raw })`, `emitRun` (internal), `runId`, `newRunRef` |
| `packages/chat/src/session/run-tracker.ts` | `RunTracker`: one per run; opens/closes steps, times calls, attributes park/yield, seals on `finish` / `abort` |
| `packages/chat/src/session/run-agent.ts` | `runAgent` creates the root tracker, a sub-tracker per `delegate_to_*` call, routes core events to the call in flight |
| `packages/chat/src/session/use-agent-session.ts` | the conversation id: `sessionStorage["<storageKey>:conversation"]` (the messages key keeps 0.4.0's format) |
| `packages/chat/src/adapter/cloud.ts` | `trace` in the body (`traceFor`), `traceparent` header, `step-start` / `step-finish` (with usage) parts |
| `packages/chat/src/adapter/wire.ts` | `readParts(body, id, onMetadata)`, `readStepMetadata` |
| `packages/chat/src/server/telemetry.ts` | `ChatTelemetryOptions`, `ChatObservability`, `ChatRefusal`, `ChatRequestContext`, `telemetrySettings`, `pickUsage`, `findWaitUntil`, `capped`, `onStreamEnd` |
| `packages/chat/src/server/handler.ts` | `telemetry`, `observability`, `waitUntil` options; `refuse()` at every early return; `serve()` inside `withContext` |
| `packages/chat/src/server/validate.ts` | `chatTraceSchema`, `TRACE_ID`; `trace` on `chatRequestSchema` |
| `packages/chat/src/shared.ts` | `validTraceparent(header)` (pure: the server imports it) |
| `packages/local-agent/src/loop.ts`, `index.ts` | `step-start` / `step-finish` (no usage) per step; the adapter holds a step's opening parts until content |
| `packages/testing/src/run-record.ts`, `chat/record-runs.ts` | `RunLog`, `isRunLog`, `recordRuns`; `readRun` reads a RunLog |

## `ChatObservability` as implemented (what phase 5 implements)

```ts
interface ChatObservability {
  telemetry(ctx: ChatRequestContext): Partial<ChatTelemetrySettings>; // ChatTelemetrySettings = ToolLoopAgent's `telemetry`
  withContext<T>(req: Request, run: () => Promise<T>): Promise<T>;
  refused?(info: ChatRefusal, req: Request): void;
  flush(): Promise<void>;
  exportTimeoutMs?: number; // added: the cap on flush; default 5000
}
interface ChatRequestContext { agent?: WebAgent; session?: string; trace?: ChatRequest["trace"]; traceparent?: string }
interface ChatRefusal { status: number; error: string; reason?: string; trace?: ChatRequest["trace"] }
```

`ChatRequestContext.traceparent` is an addition: the request's header when `validTraceparent` accepts it, else
undefined. `withContext` still receives the raw `Request`; use `validTraceparent(req.headers.get("traceparent"))`
(exported from `@webmcp-agents/chat/server`) so a malformed header is ignored the same way.

## How the handler calls it, in order (one POST)

1. Early checks (method, cross-site, `guard`, chat disabled, session, body, schema, agent, `requireAgent`,
   `beforeModel`). Any refusal: `report()` → `telemetry.onRefused(info)` then `observability.refused(info)` (each in
   try/catch, logged once), then `flush(host)`, then the response. `info.reason` is redacted and capped; no content.
2. `observability.withContext(req, serve)`. If it rejects before calling `serve`, the handler logs once and calls
   `serve` itself; `serve` runs at most once (memoized). A non-Response result → `serve()`.
3. Inside `serve`: `modelFor`, settings; then (unless `telemetry: false`) `metadata(req, ctx)` (capped at 2 s, checked,
   logged once on failure) and `observability.telemetry(ctx)` (try/catch); merged by `telemetrySettings`:
   `{ ...layer, functionId, recordInputs: handler ?? layer ?? false, recordOutputs: same, includeRuntimeContext }`
   plus `runtimeContext` (app metadata first, ids over it, undefined keys left out). Then `prepareAgent`.
4. `createAgentUIStreamResponse` with `messageMetadata` (finish part → `{ usage, model }`, unless `usageToClient`
   false or `telemetry: false`). A model error mid-stream → `report({ status: 502, error: "model_error", reason:
   upstream status })`.
5. The response body is wrapped (`onStreamEnd`): when the stream is read to the end, cancelled or errors,
   `flush(host)` runs: `capped(observability.flush(), exportTimeoutMs)` handed to `waitUntil` when found (option →
   an argument after the request with `.waitUntil` → `globalThis[Symbol.for("@vercel/request-context")].get().waitUntil`),
   else left running detached. Never awaited by the stream.

## `AgentRunEvent` as shipped

Exactly design §6.2, with these details:
- `step-finish` is emitted when the step's reply is complete (before its calls). `usage` only when non-empty;
  `firstTokenMs` only when a text / reasoning / tool-call part arrived.
- `tool-finish.code`: `cancelled` for a cancelled call, `toolErrorCode(output) ?? "failed"` for an error, absent when done.
  `output` absent when the run was stopped while the call was in flight.
- `run-finish.error` is `en.errors[code]` (catalog text, never the adapter's message); `code` only for `reason: "error"`.
- `tool-park.prompt`, `tool-start.input`, `tool-finish.output` are redacted for non-raw listeners (page redactor +
  `toolSensitivity(getRegisteredWebTool(tool))`); events are frozen.
- Listeners live in `globalThis[Symbol.for("web-agents.run-listeners")]` (shared by every copy of the package).
- Abort: `signal` abort → trackers from innermost out: `tool-finish` (cancelled) of the call in flight, the open step's
  `step-finish`, `run-finish` (aborted); sealed, nothing after.
- There is no `tool-resume` event: core's `resume` is not mapped (AgentRunEvent has no member for it). The span's
  `webmcp.resume` event in design §7.5 has no source in the browser events; derive it (or drop it) in phase 5.
- A `delegate_to_*` call has a `tool-start` / `tool-finish` like any call; its sub-run's events sit in between.

## How `traceparent` is built

`newRunRef(conversation, parent?)`: a root run gets a new 16-byte trace id and an 8-byte span id
(`00-<trace>-<span>-01`); a sub-agent's run reuses the parent's trace id with a new span id. The same header is sent on
every step of that run (no per-step span id): the server's step spans are children of the run's span. Phase 5's browser
`invoke_agent` span should use the ref's trace id and span id as its own ids so the server spans join it. Under the
kit's id slot both ids are derived deterministically (FNV-1a of `trace-<n>` / `span-<n>`).

## Open questions settled

1. **ai@7.0.163, per-call `telemetry.integrations`: they REPLACE the globally registered ones for that call**
   (`localIntegrations != null ? asArray(localIntegrations) : getGlobalTelemetryIntegrations()`, `dist/index.js`
   ~4380 and ~9065; the d.ts says "take precedence"). Mechanism kept: the handler passes the layer's integrations per
   call and never registers anything; documented on `ChatObservability.telemetry` and in `create-chat-handler.md`.
   With no layer, no `integrations` key is passed, so apps' `registerTelemetry` integrations get the ids (tested).
   Phase 5: if a layer wants to keep the app's own registered integrations, it must read and include them itself.
2. **messageMetadata**: called for every `TextStreamPart`; for `start` / `finish` the value is attached to that chunk
   (`{ type: "finish", finishReason, messageMetadata }`), otherwise a separate `message-metadata` chunk is sent. The
   finish part has `totalUsage: LanguageModelUsage`: `inputTokens`, `outputTokens`, `totalTokens`,
   `inputTokenDetails.{noCacheTokens,cacheReadTokens,cacheWriteTokens}`, `outputTokenDetails.{textTokens,reasoningTokens}`.
   `pickUsage` maps to `StepUsage` (`cachedInputTokens` = cacheReadTokens, `reasoningTokens`). One request = one step,
   so total = step usage. `readParts` reads `start` / `finish` / `message-metadata` chunks.

## For phase 5

- `@webmcp-agents/telemetry`'s layer: implement `ChatObservability`; `telemetry(ctx)` should return `integrations`
  (and `isEnabled` for sampling); recording flags it returns apply only when the handler's options leave them unset.
- Browser: `onAgentRun(listener)` (redacted) is the source for `invoke_agent` / `execute_tool` / on-device `chat`
  spans. `run-start.adapter` is the adapter id; on-device steps have no `usage`/`model`.
- The kit: `runs` is real now; `spans` / `toHaveSpan` / `toBeOneTrace` remain shells. `toContainSensitive` reads a
  RunLog ("the run log", event named `type tool`).
- `PendingPart` is only `"telemetry"` now.

## Choices made without asking (also in the phase report)

- `telemetry: false` also turns off usage to the browser (off means off).
- `trace` is omitted (request untraced) when an id fails the server's pattern or the step is past 64, so ids never
  cause a 400 from our own page.
- New optional stream part `step-start`; the cloud, local and mock adapters now send `step-finish` before running a
  step's calls (and for the final step). The tracker tolerates adapters that do neither.
- The local adapter announces all of a step's calls before running them; calls left unrun when it stops early answer
  `Error [cancelled]: Not run…`.
- `ChatRefusal.status` for a model error mid-stream is 502 (the stream itself is 200); `error: "model_error"`.
- Guard / `beforeModel` responses: `error` / `reason` read from their JSON body (200 ms cap), else `refused`.
- `metadata` is capped at 2 s.
