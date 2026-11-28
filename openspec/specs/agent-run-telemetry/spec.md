# agent-run-telemetry Specification

## Purpose
Makes one turn of an agent traceable: every step request carries the ids that tie it to its conversation and run,
the browser reports what happened in a run as events, and the server can attach those ids and per-step usage to
telemetry without ever recording content the app did not opt into.

## Requirements

### Requirement: R-RUN-1 Every step request carries the run's ids
Every step request of a run SHALL carry the same `conversation` id and `run` id, and its own `step` number starting
at 1. A sub-agent's requests SHALL also carry `parent`, the id of the delegating call. Ids SHALL be unique across
pages and tabs, and each step SHALL send a `traceparent` header that places it under the run's trace.

#### Scenario: Three steps of one run
- **WHEN** a run takes three model steps
- **THEN** the three requests share one `conversation` and one `run`, and carry `step` 1, 2 and 3

#### Scenario: Two turns of one conversation
- **WHEN** the person sends a second message in the same chat
- **THEN** its requests carry the same `conversation` and a new `run`

#### Scenario: A sub-agent
- **WHEN** an agent delegates to a sub-agent
- **THEN** the sub-agent's requests carry `parent` equal to the delegating call's id and the same `conversation`

#### Scenario: Restore keeps the conversation
- **WHEN** the person restores the chat to an earlier message and sends again
- **THEN** the new run carries the same `conversation` id

#### Scenario: An id the server will not accept
- **WHEN** a request's `trace` holds an id longer than 64 characters, or with characters outside letters, digits, `_`, `.`, `-`, or a `step` outside 1 to 64
- **THEN** the request is refused as a bad request and no model call is made

#### Scenario: A malformed trace header
- **WHEN** the `traceparent` header does not match the W3C format
- **THEN** it is ignored and the request is served as a new trace

### Requirement: R-RUN-2 Run events are delivered in order
`onAgentRun` SHALL deliver `run-start`, `step-start`, `step-finish`, `tool-start`, `tool-park`, `tool-yield`,
`tool-finish` and `run-finish` in the order they happen, for cloud and on-device runs, for the chat, `useWebAgent`
and `agent.invoke`, sub-agents included. Inputs and outputs in events SHALL be redacted unless the listener asked
for raw data.

#### Scenario: A parked tool
- **WHEN** a run calls one tool that waits for the person, who then confirms
- **THEN** `tool-park` precedes `tool-finish`, and `tool-finish` reports a waited time greater than zero

#### Scenario: A whole run
- **WHEN** a run takes two steps with one tool call between them
- **THEN** the events are `run-start`, `step-start`, `step-finish`, `tool-start`, `tool-finish`, `step-start`, `step-finish`, `run-finish`, all with the same run reference

#### Scenario: A sub-agent's events
- **WHEN** a tool call delegates to a sub-agent
- **THEN** the sub-agent's events carry a reference whose `parent` is that call, and they fall between that call's `tool-start` and `tool-finish`

#### Scenario: The cursor yields
- **WHEN** the person interacts with the page while a tool is running
- **THEN** a `tool-yield` event with its reason is delivered for that call, between its `tool-start` and `tool-finish`

#### Scenario: The person stops the run
- **WHEN** the run is aborted while a tool is in flight
- **THEN** that tool's `tool-finish` reports `cancelled` and `run-finish` reports `aborted`; nothing is emitted after it

#### Scenario: The step limit
- **WHEN** a run reaches its maximum number of steps
- **THEN** `run-finish` reports `max-steps`

#### Scenario: A failure
- **WHEN** the endpoint refuses a step or the network fails
- **THEN** `run-finish` reports `error` with the error code, and its message carries no content

#### Scenario: An on-device run
- **WHEN** a run uses the on-device adapter
- **THEN** the same events are delivered, and `step-finish` carries no usage

#### Scenario: A listener throws
- **WHEN** a listener throws on an event
- **THEN** the run continues, the other listeners still receive the event, and the error is logged once

#### Scenario: Unsubscribing
- **WHEN** the function returned by `onAgentRun` is called
- **THEN** that listener receives no further event

#### Scenario: Redacted by default
- **WHEN** a tool is called with a password and a listener is subscribed without options
- **THEN** the event's `input` shows the mask; a listener subscribed with `{ raw: true }` receives the value

#### Scenario: Usage reaches the browser
- **WHEN** the server reports token usage for a step and `usageToClient` is not turned off
- **THEN** that step's `step-finish` event carries the usage and the model id

#### Scenario: Usage kept on the server
- **WHEN** `usageToClient` is false
- **THEN** no usage is sent to the browser, and `step-finish` carries timing only

### Requirement: R-RUN-3 Traces carry ids and never content by default
With an AI SDK telemetry integration present and no option set, a step's trace SHALL carry the conversation, run,
step, agent and session ids, and SHALL NOT carry prompt, tool input or tool output content. Recording content SHALL
require an explicit opt-in. A refused request SHALL be reported to `onRefused` without content.

#### Scenario: Defaults
- **WHEN** a step runs with telemetry present and no telemetry option
- **THEN** its span carries the ids, and a card number typed in the prompt appears nowhere in the recorded spans

#### Scenario: Opting in
- **WHEN** `recordInputs` and `recordOutputs` are set
- **THEN** prompts and model output are recorded, still passed through redaction

#### Scenario: How traces are grouped
- **WHEN** no `functionId` is given
- **THEN** a request for agent `store` is recorded under `web-agent.store`, and a request with no agent under `web-agent`

#### Scenario: Hooks see the ids
- **WHEN** the app's `prepareAgent` or `beforeModel` hook runs for a request with a session
- **THEN** its context holds that request's `trace` and `session`

#### Scenario: App metadata
- **WHEN** `metadata` returns `{ "user.id": "u1" }` for a request
- **THEN** the step's span carries that attribute

#### Scenario: Metadata fails
- **WHEN** the app's `metadata` function throws or rejects
- **THEN** the request is served without the extra attributes and the failure is logged once

#### Scenario: A refusal
- **WHEN** a request is refused by a guard, a missing session, validation or the budget, or the model call fails
- **THEN** `onRefused` receives the status, the error code, the reason and the trace ids, and no message content

#### Scenario: Telemetry turned off
- **WHEN** the handler is created with `telemetry: false`
- **THEN** no telemetry setting is passed to the model call and ids are still accepted on the wire

#### Scenario: Flushing on serverless
- **WHEN** an observability layer is given and the host offers `waitUntil`
- **THEN** the layer's `flush` is handed to it after the stream closes, and a failing flush does not affect the response

#### Scenario: Flushing without `waitUntil`
- **WHEN** the host has no `waitUntil`
- **THEN** `flush` is awaited after the stream closes, for no longer than the export timeout, and the stream itself is not delayed

#### Scenario: An incoming trace
- **WHEN** a request carries a valid `traceparent` and an observability layer is given
- **THEN** the step's server span is a child of that trace

### Requirement: R-RUN-4 Old and new versions interoperate
A server or page from 0.4.0 or earlier SHALL interoperate with a new one: an unknown `trace` field is stripped by an
old server, and an absent `trace` is accepted by a new one.

#### Scenario: New page, old server
- **WHEN** a new page posts `trace` and `traceparent` to a 0.4.0 handler
- **THEN** it answers 200 with the same stream as before

#### Scenario: Old page, new server
- **WHEN** a 0.4.0 page posts no `trace` to a new handler
- **THEN** it answers 200; spans carry no conversation id and nothing throws

#### Scenario: Old server, no usage
- **WHEN** a new page talks to a server that sends no usage
- **THEN** `step-finish` is still emitted, with timing and no usage
