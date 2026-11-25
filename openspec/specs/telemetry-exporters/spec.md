# telemetry-exporters Specification

## Purpose
Sends an agent's runs to any observability backend that speaks OpenTelemetry, from the server and from the browser,
with one line of code and standard environment variables, without a vendor type in this library, without touching
an app's global telemetry setup, and without a backend credential ever reaching the page.

## Requirements

### Requirement: R-EXP-1 One line and standard env export every model step
With `observability: defineObservability()` on the chat handler and the standard `OTEL_EXPORTER_OTLP_*` variables
set, every model step SHALL be exported, with no other code. Switching backend SHALL be an environment change.

#### Scenario: A base endpoint
- **WHEN** `OTEL_EXPORTER_OTLP_ENDPOINT` is `https://c.example` and a step runs
- **THEN** its span is posted to `https://c.example/v1/traces` with the headers from `OTEL_EXPORTER_OTLP_HEADERS`

#### Scenario: A traces endpoint wins
- **WHEN** both the base endpoint and `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://t.example/x?y=1` are set
- **THEN** spans are posted to `https://t.example/x?y=1` exactly as given

#### Scenario: Nothing configured
- **WHEN** no option, no global provider and no endpoint variable is present
- **THEN** telemetry is off, one informational line is printed in development only, and the chat works

#### Scenario: Resource and sampling from env
- **WHEN** `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_TRACES_SAMPLER=traceidratio` and its argument are set
- **THEN** exported spans carry that service name and attributes, and about that share of traces is exported

#### Scenario: Defaults
- **WHEN** no `serviceName`, `sampling` or `batchSize` is given and their env variables are unset
- **THEN** the service name is `web-agents`, every trace is sampled, and spans are sent in batches of up to 512

#### Scenario: Options over env
- **WHEN** `resourceAttributes` and `OTEL_RESOURCE_ATTRIBUTES` both set `deployment.environment`
- **THEN** the option's value is exported

#### Scenario: Sampling choices
- **WHEN** sampling is `never` (or `always_off`), or a `custom` sampler returns false for a request
- **THEN** that request exports nothing; `always` (or `always_on`) exports every one

#### Scenario: Debug output
- **WHEN** `debug` is true or `WEB_AGENTS_OTEL_DEBUG=true`
- **THEN** each exported span is also printed to the console, redacted

#### Scenario: Bad header syntax
- **WHEN** `OTEL_EXPORTER_OTLP_HEADERS` holds an entry with no `=`
- **THEN** that entry is skipped, logged once, and the other headers are sent

#### Scenario: Unknown protocol
- **WHEN** `OTEL_EXPORTER_OTLP_PROTOCOL` is not `http/json`, `http/protobuf` or `grpc`
- **THEN** telemetry is off with one error naming the three valid values, and the chat works

#### Scenario: Nothing loads before it is needed
- **WHEN** the module is imported and no request has arrived
- **THEN** no OpenTelemetry package has been loaded and no network request made

### Requirement: R-EXP-2 Any standard OpenTelemetry instance is accepted as is
Any OpenTelemetry `SpanExporter`, `SpanProcessor` or `TracerProvider` instance SHALL be accepted unmodified.
Adding a backend SHALL require no change in this repository: no vendor name, type or code path.

#### Scenario: A vendor's exporter
- **WHEN** an in-memory or vendor `SpanExporter` instance is passed in `exporters`
- **THEN** it receives the step's spans, each carrying the conversation id

#### Scenario: A vendor's processor
- **WHEN** a `SpanProcessor` instance is passed in `spanProcessors`
- **THEN** it sees each span before redaction and export

#### Scenario: A provider passed in
- **WHEN** a `TracerProvider` instance is passed
- **THEN** spans are created through it and no other provider is built

#### Scenario: Explicit OTLP targets
- **WHEN** two OTLP targets are configured, one by base `endpoint` and one by exact `endpoints.traces`
- **THEN** each receives the spans at its own URL with its own headers

#### Scenario: Options win over a global provider
- **WHEN** `exporters` are given and the app also registered a global provider
- **THEN** spans go to the given exporters through a private provider, and the global one receives none

#### Scenario: Both endpoint forms on one target
- **WHEN** a target is given both `endpoint` and `endpoints`
- **THEN** that target is disabled with an error, and the other targets still export

#### Scenario: Attribute styles
- **WHEN** `conventions` is `genai`, `legacy` or `both`
- **THEN** model spans carry `gen_ai.*` names, `ai.*` names, or one set from each tracer

#### Scenario: Mapping for a backend's grouping key
- **WHEN** `metadataMapping` maps the conversation id to `session.id`
- **THEN** exported spans carry both attributes with the same value

### Requirement: R-EXP-3 An app's own OpenTelemetry setup is used and never replaced
When the app registered a global tracer provider and nothing else is configured, spans SHALL go through it. The
library SHALL NOT register or replace a global tracer provider or a global AI SDK telemetry integration.

#### Scenario: A global provider exists
- **WHEN** the app registered a global provider and `defineObservability()` is used with no option
- **THEN** the step's spans reach the app's exporter, and the global provider is the same object before and after

#### Scenario: A global provider wins over env
- **WHEN** the app registered a global provider and `OTEL_EXPORTER_OTLP_ENDPOINT` is also set, with no option
- **THEN** spans go through the app's provider and the library builds no exporter of its own

#### Scenario: No provider was registered
- **WHEN** nothing registered a global provider and no endpoint is set
- **THEN** the default no-op provider is not mistaken for one: telemetry is off

#### Scenario: Require the global one
- **WHEN** `tracerProvider: "global"` is set and none is registered
- **THEN** telemetry is off with one error saying what to register, and the chat works

#### Scenario: Never the global one
- **WHEN** `tracerProvider: "own"` is set and a global provider exists
- **THEN** a private provider is used and the global one receives none of these spans

#### Scenario: Shutdown
- **WHEN** `shutdown()` is called while the app's global provider is in use
- **THEN** the app's provider is not shut down

### Requirement: R-EXP-4 Browser spans join the trace without a credential in the page
`observeAgents()` together with the relay SHALL add browser spans (the run and each tool call) to the same trace as
the server's model steps. No backend credential SHALL reach the browser. The relay SHALL treat the browser as
untrusted.

#### Scenario: One turn, one trace
- **WHEN** a turn takes two model steps and one tool call with browser and server telemetry on
- **THEN** one trace holds an `invoke_agent` span with two `chat` children and one `execute_tool` child

#### Scenario: A sub-agent
- **WHEN** a tool call delegates to a sub-agent
- **THEN** the sub-agent's `invoke_agent` span is a child of that call's `execute_tool` span, in the same trace

#### Scenario: A confirmation
- **WHEN** a tool waits for the person, the cursor yields once, and the person confirms
- **THEN** its `execute_tool` span carries the confirmation outcome and the waited time, and has `webmcp.park`, `webmcp.yield` and `webmcp.resume` events

#### Scenario: An on-device run
- **WHEN** a run uses the on-device adapter
- **THEN** each step is a browser `chat` span with no usage, and there is no server span

#### Scenario: Nowhere to send
- **WHEN** the page has no relay and no tracer provider
- **THEN** no span is built and no request is made

#### Scenario: No secret in the page
- **WHEN** the page's bundle and network requests are inspected
- **THEN** no backend key or header value appears; the browser posts only to the app's own relay

#### Scenario: The page already runs OpenTelemetry
- **WHEN** the page registered a global web tracer provider
- **THEN** the browser spans go through it, and its bridge code is loaded only in that case

#### Scenario: Relay refusals
- **WHEN** the relay receives a cross-site request, a body over the limit, malformed JSON, a wrong content type, or spans from another instrumentation scope
- **THEN** it answers a 4xx with no detail and forwards nothing

#### Scenario: The app's guard
- **WHEN** the relay's `guard` returns a response (a rate limit, a session check)
- **THEN** that response is sent and nothing is forwarded

#### Scenario: The body limit
- **WHEN** no `maxBytes` is given and a body larger than 256 KB arrives
- **THEN** it is refused

#### Scenario: Server-side attributes
- **WHEN** the relay's `attributes` returns a release and a region
- **THEN** forwarded spans carry them as resource attributes

#### Scenario: The browser's sampling flag
- **WHEN** a client marks its spans as not sampled, or as sampled when the server samples none
- **THEN** the server's own sampling decides

#### Scenario: Same pipeline
- **WHEN** the server exports through an app's global provider
- **THEN** relayed browser spans reach that same provider

#### Scenario: The relay redacts again
- **WHEN** a client posts a span whose attribute holds a card number
- **THEN** the forwarded span carries the redacted form

#### Scenario: Upstream failure
- **WHEN** the backend rejects the relayed spans
- **THEN** the relay still answers `202` with no body and reveals nothing about the upstream error

#### Scenario: Batching in the browser
- **WHEN** spans are produced and neither `batchMs` nor `batchSize` is given
- **THEN** they are sent at most every 2 seconds, or sooner once 64 are waiting

#### Scenario: Printing instead of sending
- **WHEN** `consoleExporter()` is the only exporter
- **THEN** each span is printed to the console and no network request is made

#### Scenario: Leaving the page
- **WHEN** the page is hidden or unloaded with spans still buffered
- **THEN** they are sent before the page goes

#### Scenario: Size
- **WHEN** the browser entry's default path is measured
- **THEN** it is at most 3 KB min+gz

### Requirement: R-EXP-5 Content is exported only on opt-in, and always redacted
No prompt, tool input, tool output or typed value SHALL be exported unless recording is on. With recording on,
redaction SHALL still apply, last in any pipeline the library builds. Through an app's own global provider, the
library SHALL redact every attribute it sets before the span is created.

#### Scenario: Defaults
- **WHEN** a person writes a card number and a tool is called with it, with telemetry on and no recording option
- **THEN** the number appears in no exported span, browser or server

#### Scenario: Recording on
- **WHEN** `recordInputs` and `recordOutputs` are on
- **THEN** tool arguments and results are exported with sensitive values redacted

#### Scenario: Through the app's provider
- **WHEN** spans go through an app's global provider, with recording on, and a tool is called with a card number
- **THEN** the attributes this library set carry the redacted form; what the app's own processors add is the app's to handle

#### Scenario: A filter
- **WHEN** `spanFilter` returns false for a span
- **THEN** that span is not exported

### Requirement: R-EXP-6 A telemetry fault never affects a chat request
A missing optional peer, bad environment, failing exporter or unreachable backend SHALL be logged once and SHALL
NOT change the outcome or the timing contract of a chat request.

#### Scenario: A throwing exporter
- **WHEN** an exporter throws on export
- **THEN** the chat request answers 200 with its normal stream

#### Scenario: A missing package
- **WHEN** `http/protobuf` is configured and its exporter package is not installed
- **THEN** telemetry is off with one error naming the package to install, and the chat works

#### Scenario: The telemetry packages are absent
- **WHEN** `@ai-sdk/otel` or `@opentelemetry/api` is not installed
- **THEN** telemetry is off with one error naming the package, and the chat works

#### Scenario: An unreachable backend
- **WHEN** the endpoint never answers
- **THEN** the export is dropped after its timeout and the chat response is not delayed by it

#### Scenario: Logged once
- **WHEN** the same fault happens on a hundred requests
- **THEN** it is logged once, redacted

#### Scenario: Flush never rejects
- **WHEN** `flush()` is called while the backend is down
- **THEN** it resolves

### Requirement: R-EXP-7 Consent and the kill switch are honored
`enabled()` returning false SHALL export nothing from the browser. `OTEL_SDK_DISABLED=true` SHALL make the server
create no span and the relay drop what it receives. `WEB_AGENTS_OTEL_ENABLED=false` SHALL turn off only this
library's telemetry.

#### Scenario: No consent
- **WHEN** `enabled` returns false when a run starts
- **THEN** that run produces no span and no request to the relay

#### Scenario: Consent given later
- **WHEN** `enabled` returns false for one run and true for the next
- **THEN** only the second run is exported

#### Scenario: The standard kill switch
- **WHEN** `OTEL_SDK_DISABLED=true` and the browser posts spans to the relay
- **THEN** the relay answers `202` and nothing is exported

#### Scenario: Only this library
- **WHEN** `WEB_AGENTS_OTEL_ENABLED=false` and the app has its own OpenTelemetry setup
- **THEN** the app's own spans are unaffected and none of this library's are created

#### Scenario: Stopping
- **WHEN** the function returned by `observeAgents()` is called
- **THEN** buffered spans are flushed and no further run is observed
