# Spec Delta

## Purpose

Keeps sensitive values (passwords, card numbers, tokens, emails, fields an app marks) out of everything the library
shows, logs or exports about a tool call, with one configuration per page and per server. It reduces accidental
leakage; it is not a security boundary against a hostile page or a model that repeats data in prose.

## ADDED Requirements

### Requirement: R-RED-1 One redactor serves every sink
One redactor per page and one per server SHALL be used by every library sink: the `fill` event value and the
cursor's live region, the devtools call log and its copy action, the chat's tool card, run events, telemetry spans
and the relay, URLs leaving the page, console output, and server logs. Configuring it once SHALL change all of them.

#### Scenario: One configuration, every sink
- **WHEN** the page is configured with an extra sensitive key `loyaltyId` and a tool is called with `loyaltyId: "L-99"`
- **THEN** `L-99` appears in none of the devtools log, the tool card, run events, exported spans or console output

#### Scenario: Configured after a sink already ran
- **WHEN** redaction is configured again after a tool call was already logged
- **THEN** the next call is redacted by the new rules in every sink

#### Scenario: Request bodies stay out of logs
- **WHEN** the chat handler logs a refused or failed request
- **THEN** the log line holds the status, the code and the redacted error, and never the request body

#### Scenario: Server and page are separate
- **WHEN** the chat handler is given its own redaction options
- **THEN** server logs, refusals and server spans follow them, whatever the page configured

### Requirement: R-RED-2 Redaction is on by default and cannot leak by failing
Redaction SHALL be on by default, SHALL run after any user-supplied processor, SHALL NOT mutate its input, and
SHALL NOT throw. A rule that fails SHALL redact the value it was given.

#### Scenario: Defaults with no configuration
- **WHEN** a value holds `password`, an `Api-Key` header name, an `authToken` field, an email, and a card number that passes the Luhn check
- **THEN** each is replaced by `[REDACTED]`, and `tokenCount: 12` and a 16-digit number that fails Luhn are kept

#### Scenario: Field names that only end with the letters of a sensitive word
- **WHEN** a value has fields named `timespan`, `japan`, `spin` and `shipping`
- **THEN** none is redacted, while `user_api_key`, `x-auth-token`, `cardNumber` and `card_pin` are

#### Scenario: Field names written with no separator
- **WHEN** a value has fields named `accesstoken`, `refreshtoken`, `userpassword` and `clientsecret`
- **THEN** each is redacted

#### Scenario: Allowed names and exact paths
- **WHEN** `allowKeys` holds `sessionCount` and `paths` holds `output.*.address`
- **THEN** `sessionCount` is kept, and `address` under any one key of `output` is redacted

#### Scenario: Default detectors
- **WHEN** a string holds a JWT, a `Bearer` credential, and a key that looks like `sk-…`, `ghp_…` or `AKIA…`
- **THEN** each is redacted, and a phone number and an IBAN are kept until their detectors are turned on

#### Scenario: A detector that fails
- **WHEN** a pattern rule's `validate` throws, or a pattern is given without the global flag
- **THEN** the match is redacted and scanning ends; it neither leaks nor loops

#### Scenario: Masking one value
- **WHEN** `mask` is called with `4242424242424242` and the `partial` style
- **THEN** it returns `42••••42`, and a value too short to keep both ends is fully redacted

#### Scenario: The input is left alone
- **WHEN** an object containing a reference to itself and a `password` is redacted
- **THEN** the original still holds the password, the copy shows `[REDACTED]`, and the self-reference reads `[Circular]`

#### Scenario: A custom rule throws
- **WHEN** the app's `custom` rule throws for a value
- **THEN** that value is replaced by the token, no error escapes, and the rest of the object is processed

#### Scenario: Awkward values
- **WHEN** a value contains a `Map`, a `Set`, an `Error`, a `BigInt`, a typed array, a getter that throws, or a frozen object
- **THEN** a result comes back without a throw, and the throwing getter's value is the token

#### Scenario: Depth and length limits
- **WHEN** a value is nested deeper than `maxDepth` or holds a string longer than `maxStringLength`
- **THEN** the deeper part reads `[Truncated]`, the string is cut then scanned, and a 1 MB string returns promptly

#### Scenario: Readable traces with indexed tokens
- **WHEN** the `indexed` style redacts `from: a@x.com`, `to: b@x.com`, `cc: a@x.com` within one scope
- **THEN** the result is `[EMAIL_1]`, `[EMAIL_2]`, `[EMAIL_1]`, and a new scope starts numbering again

#### Scenario: JSON inside a string
- **WHEN** a string field holds `{"secret":"x","qty":2}`
- **THEN** it comes back as `{"secret":"[REDACTED]","qty":2}`

#### Scenario: A user processor adds data
- **WHEN** an app's span processor adds an attribute holding an email, in a pipeline the library built
- **THEN** the exported span carries the redacted form, because redaction runs after it

### Requirement: R-RED-3 Marked fields and sensitive controls are masked everywhere
A tool's `sensitive` fields, schema properties marked `x-sensitive: true` or `format: "password"`, and sensitive
controls (password type, a credential or payment `autocomplete` value, or `data-agent-sensitive`) SHALL be masked
in the `fill` event's value, run events, UI, devtools, logs and telemetry. The tool's `execute` SHALL still receive
the real value, and `onAgentEvent` listeners SHALL still receive `args` and `result` as before.

#### Scenario: A tool marks a parameter
- **WHEN** a tool with `sensitive: ["passport"]` is called with `passport: "A1234567"`
- **THEN** that string appears in no redacted sink, and the tool's `execute` receives `A1234567`

#### Scenario: Existing event listeners are not broken
- **WHEN** a listener registered with `onAgentEvent` receives the `start` and `result` events of that call
- **THEN** `args` and `result` are what they were in 0.4.0; only a `fill` event's `value` is masked

#### Scenario: A schema marks a property
- **WHEN** a tool's input schema marks `cardNumber` with `x-sensitive: true`, or gives it `format: "password"`
- **THEN** that field is masked exactly as if the tool had listed it in `sensitive`

#### Scenario: A control is detected without an attribute
- **WHEN** the cursor types into `<input autocomplete="cc-number">`
- **THEN** the `fill` event's value and the live region show a mask, and the field itself holds the real number

#### Scenario: A control is marked by the page
- **WHEN** the cursor types into a field that has, or sits inside an element that has, `data-agent-sensitive`
- **THEN** the `fill` event's value is masked

#### Scenario: An ordinary field
- **WHEN** the cursor types into a plain text input with no marker
- **THEN** the `fill` event carries the value as before

#### Scenario: Restore does not bring a sensitive value back
- **WHEN** a sensitive field was filled and the person restores the chat to before that turn
- **THEN** the `fill` event carried no previous value for it (its other fields are unchanged), and restore leaves that field as it is

#### Scenario: Devtools reveal is for development only
- **WHEN** the devtools panel shows a call with a masked field
- **THEN** the value is masked in the log and in "copy as code" until the person uses the panel's reveal toggle, which exists only in development builds

#### Scenario: The person's own message
- **WHEN** the person types a card number into the chat composer
- **THEN** their own message is shown to them unaltered

### Requirement: R-RED-4 URLs leaving the page carry no secrets
A URL recorded in telemetry, logs or attributes SHALL carry no credentials, no hash, and no query value outside
`allowQuery`; origin and path SHALL be kept. The two URLs the model reads (the request's page URL and the page-move
note) SHALL lose credentials and any parameter that is sensitive by name or by value, and SHALL keep the rest.

#### Scenario: A reset link in telemetry
- **WHEN** the page is at `https://user:pw@shop.test/reset?token=abc&page=2#frag` and its URL is recorded on a span
- **THEN** what is recorded is `https://shop.test/reset?token=[REDACTED]&page=[REDACTED]`

#### Scenario: A search the model needs
- **WHEN** the page is at `/results?from=CAI&to=LHR&date=2026-12-20` and a step request is sent
- **THEN** the model receives those three values unchanged

#### Scenario: A secret the model does not need
- **WHEN** the page is at `https://user:pw@shop.test/reset?token=abc&email=a@b.co&page=2` and a step request is sent
- **THEN** the model receives `https://shop.test/reset?token=[REDACTED]&email=[REDACTED]&page=2`

#### Scenario: An allowed parameter
- **WHEN** `allowQuery` is `["page"]` and the URL is `https://shop.test/list?page=2&email=a@b.co`
- **THEN** what is recorded is `https://shop.test/list?page=2&email=[REDACTED]`

#### Scenario: Not a URL
- **WHEN** the value does not parse as a URL
- **THEN** it is scanned as text and no error is thrown

### Requirement: R-RED-5 What the model receives is unchanged unless the tool opts in
Tool inputs and tool results sent to the model SHALL be unchanged by default. A tool that sets `hideFromModel` on
its `sensitive` output fields SHALL have those fields reach the page and the person while the model receives the
token. The conversation the chat stores for the next turn SHALL follow the same rule.

#### Scenario: Default
- **WHEN** a tool returns an email and has no `hideFromModel`
- **THEN** the next model request contains the email, and telemetry and logs do not

#### Scenario: Opt in
- **WHEN** a tool returns `bookingReference` with `sensitive: { output: ["bookingReference"], hideFromModel: true }`
- **THEN** the page shows the reference to the person, and the next model request and the stored history hold the token

### Requirement: R-RED-6 Redaction costs nothing unless used
The redaction entry SHALL be separate from the core package's main entry and SHALL NOT be pulled into it unless
used: the visual layer takes only the control check and the single-value mask from it. Core's
size budgets SHALL NOT move (visuals ≤ 10.45 KB, whole package ≤ 18.5 KB, min+gz), and the redaction entry SHALL be
at most 1.5 KB min+gz with no dependency.

#### Scenario: Size check
- **WHEN** the core size script runs
- **THEN** the visuals and whole-package measurements are within their unchanged budgets and the redact entry is reported within its own

#### Scenario: Server import
- **WHEN** the redaction entry is imported where there is no `document`
- **THEN** it loads without touching the DOM, and the control check answers false
