---
description: "Defines a tool once for every place a tool runs: the browser (document.modelContext), the devtools, the chat and a server agent."
---

# `defineWebTool`

Defines a tool once for every place a tool runs: the browser (`document.modelContext`), the devtools, the chat and a server agent. Use it for **catalog tools**, the ones that live in a module and go in [`<WebAgentsProvider tools>`](../react/web-agents-provider.md) or [`createWebAgents`](./create-web-agents.md); a tool that lives in a component passes the same definition to [`useWebTool`](../react/use-web-tool.md).

## Import

```ts
import { defineWebTool } from "@webmcp-agents/core";
import type { WebTool, WebToolConfig, WebToolContext } from "@webmcp-agents/core";
```

`@webmcp-agents/react` re-exports all of these, so a React app needs one import.

## Example

A read-only catalog tool that is on while the path is `/orders`, with an optional parameter.

<include meta='title="tools/list-orders.ts"'>/_examples/shared/tools/list-orders.ts</include>

Called from anywhere, the way an agent would call it (the cursor moves, confirmation applies):

```ts
const latest = await tools.listOrders.invoke({ limit: 1 });
```

## Options

`defineWebTool(config)` takes a `WebToolConfig`. Its type parameters are inferred from `inputSchema` (the input) and `execute` (the output).

| Name | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | required | The tool's name, unique on the page: 1 to 128 of `a-z A-Z 0-9 _ . -`. Agents call it by this name, so snake case reads best (`clear_cart`). Checked when the tool is defined. |
| `title` | `string` | — | A human name, for UIs that list tools. It is also the name the cursor looks for on the page: a button, link, tab, menu item or switch named like it. Without a title the cursor looks for the id read as words (`clear_cart` is "clear cart"). |
| `description` | `string` | required | What the tool does and when to use it, what it needs first and what comes next. The agent decides from this text alone: see [Writing tool descriptions](../../concepts/tool-descriptions.mdx). |
| `inputSchema` | `StandardSchemaV1 \| JSONSchema` | no input | The tool's parameters, as a Standard Schema (zod 4, valibot, arktype) or a JSON Schema object. It must describe an object. Input is validated against it before anything else happens, so bad input never moves the cursor and never reaches `execute`. |
| `outputSchema` | `StandardSchemaV1` | — | What `execute` should return, checked in development by `run` only: a mismatch warns in the console, never throws. For catching a tool that answers the wrong shape in tests. |
| `execute` | `(input, ctx: WebToolContext) => O \| Promise<O>` | required | The work. Its return value is the agent's answer (a string, or data that is serialised for it). Throw to fail the call: the agent reads the message as an error result with a [code](./tool-error.md). `ctx` is described under [What `execute` receives](#what-execute-receives). |
| `revert` | `(input, ctx: WebToolContext & { output?: O }) => void \| Promise<void>` | — | Undo this call's page side effects (cart, navigation, booking) when the person [restores the chat](../chat/use-agent-session.md#restore) past it. Client-only: never sent to the model. Field fills are restored automatically; implement this for everything else. Omit on read-only tools. |
| `target` | `ToolTarget \| TargetFn<I>` | found by name | Which control on the page the tool acts on: where the cursor goes, and whose click confirms. Set it when the control's name is not the tool's title, or depends on the call. A [locator](./locate.md) `{ role?, name?, within? }`, a CSS selector, or a function of the call's input returning either or an `Element` (or a promise of one, for a control that is only on the page once something opens). See [Where the cursor goes](#where-the-cursor-goes). |
| `fields` | `{ [parameter]?: FieldTarget }` | found by name | Where each parameter is typed, when its field is not named or labelled like it: a locator, the label's text, or `false` to never type that parameter (it still reaches `execute`). |
| `fill` | `(values: I) => unknown` | — | Put the call's values on screen yourself, for widgets the cursor cannot type into (a custom select, a date picker): `fill: (values) => form.reset(values)`. Runs after the cursor typed what it could and before it clicks or parks. A returned promise is awaited; a throw fails the call. |
| `requireConfirmation` | `boolean` | `false` | Make the call wait for the person's own click on the tool's control before `execute` runs. For anything the person would regret: an order, a booking, a deletion. The cursor parks on the control instead of clicking it; only a trusted click counts. It needs exactly one matching control, or the call fails with [`ConfirmationUnavailableError`](./confirmation-unavailable-error.md) instead of running unconfirmed. |
| `match` | `string \| readonly string[] \| RegExp` | on every page | Where a catalog tool is on: a path pattern (`/orders`, `/product/:slug`, `/flights/*`), several, or a RegExp tested against the path. Read by [`createWebAgents`](./create-web-agents.md) and `<WebAgentsProvider>`, which follow the browser's URL themselves; ignored by `useWebTool`, whose tool is on while its component is. See [`matchPath`](./match-path.md). |
| `readOnly` | `boolean` | not said | The tool only reads. Safe to call at any time. Becomes the WebMCP annotation `readOnlyHint`. |
| `destructive` | `boolean` | not said | The tool deletes or overwrites something that is hard to undo. Becomes `destructiveHint`. |
| `repeatable` | `boolean` | not said | Calling twice has the same effect as calling once, so an agent may retry. Becomes `idempotentHint`. |
| `external` | `boolean` | not said | The tool reaches beyond the page (the network, another system). Becomes `openWorldHint`. |
| `safeResponse` | `boolean` | not said | `false` says the answer may contain text the site did not write (reviews, messages), so an agent must not follow instructions in it. Becomes `untrustedContentHint`, inverted. Left out, agents read the answer as safe. |
| `annotations` | `WebToolAnnotations` | — | Raw WebMCP hints, for one that has no flag above. A flag wins over the same hint set here. |

### Flags and annotations

The five flags are the plain-words form of WebMCP's annotations. A flag that is set (`true` or `false`) is written over the same hint in `annotations`; a flag left out says nothing.

| Flag | WebMCP annotation |
|---|---|
| `readOnly` | `readOnlyHint` |
| `destructive` | `destructiveHint` |
| `repeatable` | `idempotentHint` |
| `external` | `openWorldHint` |
| `safeResponse` | `untrustedContentHint`, inverted |

The merged hints are what `document.modelContext` sees and what the devtools show as badges. `WebToolAnnotations` is `{ readOnlyHint?, destructiveHint?, idempotentHint?, openWorldHint?, untrustedContentHint?, [hint: string]: unknown }`.

### Where the cursor goes

Nothing is added to the page's markup. The cursor, and the confirmation click, use one control, found in this order:

1. The tool's `target`: a locator (found by role and name, see [`locate`](./locate.md)), a CSS selector, or an element. A function gets the call's input and can pick one control per call: ``target: ({ lineId }) => ({ role: "button", name: `Remove ${names[lineId]}` })``.
   A control that isn't on the page until something opens (a ⌘K palette, a drawer) comes from an async function: open
   it, wait for the control, return it. The call waits for it (up to 3 s, `OPEN_TARGET_MS`) before the cursor moves,
   so the values are typed into the opened UI: ``target: () => { openSearch(); return whenElement('input[name="query"]') }``.
2. The control named like the tool: its `title`, or its id read as words, among buttons, links, tabs, menu items and switches. A name matches exactly, else as a prefix of the control's name.

A tool with no control on the page runs at once, unseen; `start` and `result` events still fire, and in development one `console.info` says so (not for `readOnly` tools). With `requireConfirmation` the call fails instead.

Typing follows the same idea. For each parameter that has a value, the cursor looks for a field: `fields[parameter]` if given, else a control whose `name` is the parameter, else one labelled with the schema's `title` for it or with the parameter read as words, searching outward from the tool's control so the closest field wins. No field: nothing is typed, and `execute` still gets the value. Text inputs are typed a character at a time; `number`, `date`, `range` and a native `select` are written once; checkboxes and radios are clicked; a custom widget (an element with a `role` but no native control) is visited and highlighted, never written. With no visuals installed, with reduced motion, or after the person took over, the values are still written, in one step.

The order of one call: validate the input, type what the cursor can, run `fill`, park on or click the control (waiting for the person's click when `requireConfirmation`), then `execute`.

### What `execute` receives

Besides the validated input, `execute` gets a `WebToolContext`:

| Name | Type | Description |
|---|---|---|
| `signal` | `AbortSignal` | Aborts when the call is cancelled: the agent gave up, or the person cancelled. Pass it to your fetches. |
| `source` | `"webmcp" \| "chat" \| "devtools" \| "test"` | Who called: the browser's WebMCP, the chat widget, the devtools panel, or `run` in a test. |
| `toolCallId` | `string \| undefined` | The caller's id for this call, when it has one. |
| `context` | `RegisteredContext` | App state from a provider's earlier-form `context` prop or the registry's `context` option, typed via the `Register` interface. New code closes over its own state instead and never reads this. |

## Returns

A frozen `WebTool<I, O>`: every config field, plus

| Name | Type | Description |
|---|---|---|
| `kind` | `"web-tool"` | Marks a defined tool, so `useWebTool` and the catalog can tell one from a plain config. |
| `jsonSchema` | `JSONSchema` | The input schema as JSON Schema draft-07, without `$schema`; what WebMCP and the devtools see. Computed on first read. No `inputSchema` gives `{ type: "object", properties: {} }`. |
| `execute(input, ctx)` | `(I, WebToolContext) => Promise<O>` | The config's `execute`, always async. |
| `parse(input)` | `(unknown) => Promise<I>` | Validate with the Standard Schema. A JSON Schema input passes through; `undefined` or `null` becomes `{}`. Throws `WebToolInputError`, whose message names each bad field. |
| `run(input, ctx)` | `(unknown, WebToolContext) => Promise<O>` | `parse`, then `execute`, then the development-only `outputSchema` check. No page, no cursor, no confirmation: for unit tests. |
| `invoke(input?, options?)` | `(I?, { signal? }) => Promise<O>` | Call the tool the way an agent would, through `document.modelContext`: the cursor moves, fields are typed, `fill` runs, confirmation applies. Resolves to what `execute` returned (`undefined` when the call navigated the page away). `input` is required when the schema has a required parameter. |

`invoke` rejects with a [`WebToolError`](./web-tool-error.md) carrying the agent's error code when the call fails, with an `AbortError` when `options.signal` aborts, and with an `Error` when the tool is not registered on the page right now or `document.modelContext` is missing. Use `invoke` for a "Try it" button and anything that should look like an agent's call; use `run` in tests.

## Notes

- The `id` is checked at definition time; an invalid one throws a `TypeError`.
- `jsonSchema` throws a `TypeError` if the Standard Schema library does not implement Standard JSON Schema (pass a JSON Schema object instead, e.g. `z.toJSONSchema(schema, { target: "draft-07", io: "input" })`), or if the schema's `type` is not `"object"`. A missing `type` is set to `"object"`.
- A function `target` gets the validated input when the call runs, but the arguments as sent (possibly none) when a run is animated after the fact, so read them defensively. A throw, or an invalid selector, counts as no target and the control is found by name. An async target is called once per call, when it starts, and never otherwise (a run animated after the fact, the devtools); a promise that rejects, or hasn't settled after `OPEN_TARGET_MS`, counts as no target. Later checks in the same call (the confirm gate following its control) reuse what it resolved to; calls that overlap each keep their own. `TargetFn` and `fill` are declared as methods so a `WebTool<Input>` still fits where a `WebTool<unknown>` is expected (catalogs hold mixed tools).
- `match`, `fill` and `fields` are not part of what WebMCP sees (see [`webToolSignature`](./web-tool-signature.md)).
- Invalid input never moves the cursor: validation runs first, and the call answers unseen with the code `invalid_input`.
- With `requireConfirmation`, a control found by name (a locator, or the tool's title) must be unique: with none, or several, the call fails with [`ConfirmationUnavailableError`](./confirmation-unavailable-error.md) and a hint to set a `target`. A CSS selector that matches several keeps working: any of them confirms.
- `fill` runs once per call, after the cursor has typed (or the call wrote the values) and before the park. A throw fails the call.
- Throw a [`WebToolError`](./web-tool-error.md) to choose the error code the agent gets. Any other throw is `failed`; bad input is `invalid_input`.
- WebMCP carries only text, so `invoke`'s return value travels beside the call, in order per tool: two concurrent calls of one tool, one by an agent and one by `invoke`, could swap their values.
- The config is a structural superset of Mastra's `createTool` config and the AI SDK's `tool()` input (`id`, `description`, `inputSchema`, `outputSchema`, `execute`), so one definition can also be handed to a server agent.

## See also

- [Define a tool](../../build/define-a-tool.mdx), the page that teaches it
- [`useWebTool`](../react/use-web-tool.md), the same definition in a component
- [`locate`](./locate.md), the finder behind `target` and `fields`
- [`createWebAgents`](./create-web-agents.md) and [`<WebAgentsProvider>`](../react/web-agents-provider.md), where catalog tools go
- [`registerWebTool`](./register-web-tool.md) and [`toModelContextTool`](./to-model-context-tool.md), the registration underneath
- [`WebToolError`](./web-tool-error.md) and [tool error codes](./tool-error.md)
- [`webToolSignature`](./web-tool-signature.md), what makes a tool re-register
