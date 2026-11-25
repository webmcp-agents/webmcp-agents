# chat-customization Specification

## Purpose
Lets an app change every visual value and every visible string of the chat (`<AgentChat>` and the registry blocks)
from CSS variables, from a plain object or JSON, or by replacing a part, with no fork and no `!important`, in any
language and in right-to-left layouts.

## Requirements

### Requirement: R-CHAT-1 Every string comes from the message catalog
Every user-visible string, `aria-label`, `placeholder`, `title` and screen-reader announcement of the chat SHALL
come from the message catalog. No string SHALL exist outside it, in any state: empty, connecting, downloading,
answering, a parked tool, a sub-agent, restore and its confirmation, the resize handle, and every error.

#### Scenario: A sentinel catalog
- **WHEN** the chat is rendered with a catalog in which every entry is a unique marker, and driven through every UI state
- **THEN** no text, label, placeholder or title appears that is not a marker, apart from the model's and the person's own text

#### Scenario: A missing key
- **WHEN** an override omits a key, or sets one to `null`
- **THEN** the English default is shown; `undefined` or the key name is never rendered

#### Scenario: Errors arrive as codes
- **WHEN** the endpoint refuses a request (not configured, rate limited, daily limit, bad request, no session, busy), the network fails, or a run is aborted, fails, or reaches its step limit
- **THEN** the chat shows the catalog's text for that code (`aborted`, `run_failed` and `max_steps` included), and an unrecognized failure shows the `unknown` text

#### Scenario: Server-only codes
- **WHEN** the endpoint answers `forbidden`, `method_not_allowed`, `server_error`, `forbidden_origin` or `unavailable`
- **THEN** the person sees the `unknown` or `busy` text; those codes are not catalog keys

#### Scenario: Callers that are not the UI
- **WHEN** `agent.invoke` or `useWebAgent` receives an error
- **THEN** it carries both the code and an English `error` text, as before

#### Scenario: Headless use
- **WHEN** `useAgentChat` is given `messages` and `locale`
- **THEN** the error text it returns comes from that catalog

#### Scenario: Text meant for the model
- **WHEN** the handler is given its own `messages` (tool budget, tool not on page, server error)
- **THEN** those are the strings the model or a non-UI caller receives

### Requirement: R-CHAT-2 Messages accept plain JSON, placeholders, plurals and functions
`messages` SHALL accept a partial override at any depth, as plain JSON, with `{name}` placeholders and
`{n, plural, …}` forms resolved by the locale's plural rules, and SHALL accept a function of the values where a
template is not enough.

#### Scenario: A placeholder
- **WHEN** `tool.running` is `"Working on {tool}…"` and the tool is `add_to_cart`
- **THEN** the card reads `Working on add_to_cart…`

#### Scenario: Arabic plurals
- **WHEN** `steps` is an ICU-style plural with `zero`, `one`, `two`, `few`, `many`, `other` and the locale is `ar`
- **THEN** counts 0, 1, 2, 3 and 11 pick the `zero`, `one`, `two`, `few` and `many` forms, and `#` is the localized number

#### Scenario: A function
- **WHEN** `steps` is a function returning `"1 step"` for one and `"{count} steps"` otherwise
- **THEN** its return value is shown

#### Scenario: A value that is not given
- **WHEN** a template names a placeholder the chat does not supply
- **THEN** it is replaced by an empty string and nothing throws

#### Scenario: A function that throws
- **WHEN** a message function throws
- **THEN** the English default for that key is shown and the chat keeps working

#### Scenario: Malformed plural syntax
- **WHEN** a plural template is missing its `other` form or a closing brace
- **THEN** the string is shown without crashing, and never as `undefined`

### Requirement: R-CHAT-3 Every visual value is a documented variable
Every color, size, radius, shadow, duration, font value and z-index of the chat SHALL be a documented `--wa-chat-*`
variable, and `theme` SHALL map one to one onto them. A theme SHALL be a single object, or one per color scheme.

#### Scenario: A theme value becomes a variable
- **WHEN** the chat is rendered with `theme={{ color: { accent: "red" } }}`
- **THEN** the computed `--wa-chat-color-accent` on the chat's root is `red`

#### Scenario: No raw value in the stylesheet
- **WHEN** the stylesheet is scanned outside its token declarations
- **THEN** it holds no literal color, pixel size, physical `left` / `right`, or `margin` / `padding` side

#### Scenario: Light and dark
- **WHEN** a theme gives `light` and `dark` and the OS prefers dark
- **THEN** the dark values apply; `colorScheme="light"` forces the light ones

#### Scenario: Without React
- **WHEN** a theme object is converted to CSS variables and assigned to an element's style
- **THEN** the chat inside it uses those values with no flash on first paint

#### Scenario: An app's own element rule
- **WHEN** the page has a plain `button { color: inherit }` rule and the chat's stylesheet is loaded
- **THEN** the chat's buttons keep the chat's colors, because the library CSS is not in a cascade layer

#### Scenario: An unknown theme key
- **WHEN** a theme object from JSON holds a key that is not a token
- **THEN** it is ignored and no invalid property is written

### Requirement: R-CHAT-4 Every element can be targeted
Every element the chat renders SHALL carry `data-wa-part` with its part name, SHALL expose its state as data
attributes (`data-state`, `data-role`, `data-open`, `data-busy`), and SHALL accept a class and a style through
`classNames` and `styles`.

#### Scenario: A class on a part
- **WHEN** `classNames={{ send: "btn btn-primary" }}` and `styles={{ launcher: { insetInlineEnd: 24 } }}` are given
- **THEN** the send button has those classes in addition to its own, and the launcher has that inline style

#### Scenario: The registry blocks
- **WHEN** a registry chat block is given `messages`, `locale` and `classNames`
- **THEN** it translates, formats and applies classes the same way `<AgentChat>` does

#### Scenario: A state selector
- **WHEN** a tool is waiting for the person
- **THEN** its card matches `[data-wa-part="toolCard"][data-state="awaiting-confirmation"]`

#### Scenario: Every part is present
- **WHEN** the chat is driven through every UI state
- **THEN** each part name in the public list was rendered on at least one element, and no element lacks the attribute

### Requirement: R-CHAT-5 Parts are replaceable and the styles are optional
Every part in the components map SHALL be replaceable by an app's own component, which receives the part's props,
the catalog and the translate function. `unstyled` SHALL render the chat with no library CSS, keeping the
`data-wa-part` hooks and accessibility attributes.

#### Scenario: A replaced tool card
- **WHEN** `components={{ ToolCard }}` is given and a tool runs
- **THEN** the app's component renders in its place with the call, and spreading `partProps` keeps the hook attributes

#### Scenario: Unstyled
- **WHEN** `unstyled` is set and the stylesheet is not imported
- **THEN** no library class or variable styles the output, and roles, labels and keyboard behavior are unchanged

#### Scenario: A replacement that throws
- **WHEN** an app's replacement component throws while rendering
- **THEN** the error surfaces to the app's own error boundary and the page's tools keep working

### Requirement: R-CHAT-6 Locale drives formatting and direction
`locale` SHALL drive number, byte and percent formatting and plural rules, and SHALL set the direction: right to
left for Arabic, Hebrew, Persian and Urdu unless `dir` says otherwise. The layout SHALL mirror in RTL. With no
`locale`, the page's `lang` SHALL be used, else English.

#### Scenario: Arabic mirrors
- **WHEN** the chat is rendered with `locale="ar"`
- **THEN** its root has `dir="rtl"` and the panel sits on the left half of the viewport

#### Scenario: A shipped locale
- **WHEN** the Arabic or Spanish catalog entry is passed as `messages`
- **THEN** every string is in that language, and an app that does not import it does not ship it

#### Scenario: Direction from the page
- **WHEN** no `locale` and no `dir` are given and the page is `<html lang="en" dir="rtl">`
- **THEN** the chat is right to left

#### Scenario: An explicit direction
- **WHEN** `locale="ar"` and `dir="ltr"` are both given
- **THEN** the direction is left to right

#### Scenario: An invalid locale
- **WHEN** `locale` is not a valid BCP 47 tag
- **THEN** the chat falls back to English formatting without throwing

### Requirement: R-CHAT-7 Version 0.4.0 pages keep working
The 0.4.0 variable names (all 18), props, `data-theme` behavior and restore UI SHALL keep working unchanged.

#### Scenario: An old variable
- **WHEN** a page sets only `--wa-chat-accent: red`
- **THEN** the launcher and send button are red, as in 0.4.0

#### Scenario: An ancestor theme attribute
- **WHEN** an ancestor of the chat has `data-theme="dark"` and `colorScheme` is not set
- **THEN** the chat renders dark, whatever the OS prefers

#### Scenario: Light on the chat itself
- **WHEN** the chat's own root has `data-theme="light"` and the OS prefers dark
- **THEN** the chat renders light, as in 0.4.0

#### Scenario: No new prop
- **WHEN** a page renders `<AgentChat>` exactly as it did on 0.4.0
- **THEN** the documentation stills of the four example apps are unchanged

#### Scenario: Restore
- **WHEN** the person restores the conversation to before a message
- **THEN** it behaves as in 0.4.0, and its button, confirmation and cancel text come from the catalog
