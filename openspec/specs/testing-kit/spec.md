# testing-kit Specification

## Purpose
Gives people who build on these packages one published way to test a tool, a confirmation, an agent, the chat UI,
the chat endpoint, privacy and telemetry, with no model, no network and no hand-written setup. The repository tests
itself with the same kit.

## Requirements

### Requirement: R-TEST-1 The kit is built on Vitest
`@webmcp-agents/testing` SHALL be built on Vitest: fixtures through `test.extend`, matchers through `expect.extend`
with types, and mocks as `vi.fn`. Vitest 4 or later SHALL be its one required peer; every other peer SHALL be optional.

#### Scenario: Fixtures arrive by destructuring
- **WHEN** a test written with the kit's `test` destructures `tools`, `events`, `user` and `mount`
- **THEN** each is set up before the test and torn down after it

#### Scenario: Fixtures are lazy
- **WHEN** a Node test destructures no fixture
- **THEN** no browser fixture is set up and the test runs in the Node environment

#### Scenario: Matchers are typed
- **WHEN** a TypeScript test calls `expect(result).toBeToolResult()` after registering the matchers
- **THEN** it type-checks with no cast, and a misspelled matcher name is a type error

#### Scenario: A mock is a spy
- **WHEN** a test registers `tools.mock("add_to_cart", impl)` and the tool is called
- **THEN** the returned mock answers `toHaveBeenCalledWith` and accepts `mockResolvedValueOnce`

#### Scenario: A missing optional peer
- **WHEN** a test imports the chat entry and `@webmcp-agents/chat` is not installed
- **THEN** the import fails with one sentence naming the package to install

### Requirement: R-TEST-2 A browser test needs no manual setup or cleanup
With `webAgentsProject("browser")`, a test SHALL need no manual setup or cleanup: the polyfill is installed, motion
is reduced so the cursor snaps, ids are deterministic, and fixtures, visuals and tools are removed after each test.

#### Scenario: A call left in flight
- **WHEN** a test ends while a tool call it started has not been answered
- **THEN** that test fails with a message naming the tool

#### Scenario: A tool left registered
- **WHEN** a test registers a tool and ends without unregistering it
- **THEN** that test fails with a message naming the tool

#### Scenario: Tests do not see each other
- **WHEN** two tests in one file each mount a page and call a tool of the same name
- **THEN** the second test sees only its own tool, events and DOM

#### Scenario: Ids are predictable
- **WHEN** the same test runs twice
- **THEN** message, call and run ids are the same both times

#### Scenario: Two-line configuration
- **WHEN** a project's Vitest config lists `webAgentsProject("unit")` and `webAgentsProject("browser")` and nothing else
- **THEN** `*.test.*` files run in Node, `*.browser.test.*` files run in Chromium, and one copy of React is loaded

#### Scenario: A page without the polyfill
- **WHEN** a browser project is given a setup that registers only the matchers
- **THEN** `document.modelContext` is not installed by the kit, so "no WebMCP" behavior can be tested

### Requirement: R-TEST-3 Agents and the endpoint are testable without a model or a key
An agent SHALL be testable with no model and no network through a scripted adapter, the real cloud adapter SHALL be
testable against a fake endpoint, and the chat endpoint SHALL be testable with a scripted model and no provider key.

#### Scenario: A scripted agent run
- **WHEN** an agent is invoked with a mock adapter scripted to call two tools then answer
- **THEN** the page's tools run in that order, the run returns the answer, and no network request is made

#### Scenario: A scripted failure
- **WHEN** the mock adapter is scripted to fail with `rate_limited`
- **THEN** the run finishes with that error code

#### Scenario: The wire, without a server
- **WHEN** the real cloud adapter is given the mock chat server's `fetch`
- **THEN** the server records each request body, and a queued `429` with `retry-after` is delivered once

#### Scenario: The endpoint, without a key
- **WHEN** the chat handler is created with a mock model and sent a request built by the kit
- **THEN** it answers a readable stream, and the mock records the tools and prompt the model was offered

#### Scenario: Guards
- **WHEN** a request has no session where one is required, or comes from another origin
- **THEN** the handler answers `401` and `403`, with no model call recorded

### Requirement: R-TEST-4 A failing matcher says what happened in words
Every matcher failure SHALL state what was expected and what happened in words: tool names, their order, their
inputs, error codes, event types. A bare object diff SHALL NOT be the whole message.

#### Scenario: An unexpected tool call
- **WHEN** `toHaveCalledTools(["track_last_order", "add_to_cart"])` runs against a run that also called `place_order`
- **THEN** the message lists the expected order, the called order, marks `place_order` as unexpected and prints its input

#### Scenario: A wrong error code
- **WHEN** `toBeToolError("not_found")` runs against a result with code `invalid_input`
- **THEN** the message names both codes and prints the result's text

#### Scenario: Negation
- **WHEN** `not.toHaveParked()` fails
- **THEN** the message says which tool parked and with what prompt

#### Scenario: The wrong kind of value
- **WHEN** a matcher is given a value it cannot read (a string where a tool result is expected)
- **THEN** it fails with a message saying what it needs, and does not throw a type error from inside

#### Scenario: A leaked value
- **WHEN** `not.toContainSensitive(["A1234567"])` fails on an event log
- **THEN** the message names the sink, the event and the path where the value was found, without printing other content

### Requirement: R-TEST-5 The repository uses the kit and keeps no private copy
The repository's own tests SHALL use the kit. The private helpers SHALL be removed: `core/src/test-utils.ts`,
`devtools/src/test-utils.ts`, `chat/test/browser-utils.ts`, `chat/test/mock-model.ts`, the five `fakeAdapter`
functions in chat's tests, and `examples/*/e2e/agent.ts`.

#### Scenario: No private helper remains
- **WHEN** the repository is searched for those files and for a function named `fakeAdapter`
- **THEN** none is found, and `pnpm check` and `pnpm e2e` pass

#### Scenario: Nothing was lost in the move
- **WHEN** the test suites run after migration
- **THEN** every test that existed before still exists and passes, and the count per package is not lower

#### Scenario: No build cycle
- **WHEN** `pnpm turbo run test` runs from a clean checkout
- **THEN** core's tests run without the testing package having been built first

### Requirement: R-TEST-6 Every testing docs snippet executes
Every code snippet in the testing docs SHALL be a real file that runs as part of `pnpm check`. A snippet that stops
compiling or stops passing SHALL fail the check.

#### Scenario: A snippet goes stale
- **WHEN** an export shown in a testing docs page is renamed
- **THEN** `pnpm check` fails on that example file

#### Scenario: Pages show the file
- **WHEN** a testing docs page shows code
- **THEN** it is included from the example file, not typed into the page

### Requirement: R-TEST-7 No runtime package imports the kit
No runtime package SHALL import `@webmcp-agents/testing`. Bundle budgets SHALL be unchanged by its existence.

#### Scenario: An import slips in
- **WHEN** a source file of a runtime package imports from `@webmcp-agents/testing`
- **THEN** the lint step fails and names the file

#### Scenario: Budgets
- **WHEN** the size scripts run after the kit is added
- **THEN** every runtime package's measurement is within its existing budget
