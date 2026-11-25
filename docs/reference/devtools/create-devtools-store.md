---
description: "Creates the devtools' state, independent of any UI: the page's tools, every call (run from the panel or by a real agent) and the panel's settings."
---

# `createDevtoolsStore`

Creates the devtools' state, independent of any UI: the page's tools, every call (run from the panel or by a real agent) and the panel's settings. Use it to build another UI on the same data, or to run tools and read their records from code.

## Import

```ts
import { createDevtoolsStore, DEFAULT_SETTINGS } from "@webmcp-agents/devtools";
import type { DevtoolsState, DevtoolsStore } from "@webmcp-agents/devtools";
```

## Example

A call log for your own panel, and a tool run through the store. `subscribe` and `getSnapshot` fit `useSyncExternalStore`.

<include meta='title="components/call-log.tsx"'>/_examples/shared/reference/devtools/create-devtools-store.tsx</include>

## Options

`createDevtoolsStore(options?)` takes `DevtoolsStoreOptions`.

| Name | Type | Default | Description |
|---|---|---|---|
| `visuals` | `DevtoolsVisuals \| null` | `null` | The agent cursor to drive from Settings (`setSpotlight`, `setYieldToUser`). With `null` the switches are disabled. |
| `storageKey` | `string` | `"web-agents-devtools"` | `localStorage` key for the settings the person changed. Use another key to keep two stores apart. |
| `maxCalls` | `number` | `200` | Calls (and markers) kept in the timeline. Older ones drop off. |
| `initialSettings` | `Partial<DevtoolsSettings>` | not said | Starting settings, below whatever the person saved. `undefined` entries are ignored. |
| `now` | `() => number` | `Date.now` | Clock in epoch ms, for tests. |

`DEFAULT_SETTINGS` is the `DevtoolsSettings` before anything is passed or saved:

```ts
const DEFAULT_SETTINGS = {
  open: false, tab: "tools", dock: "bottom", size: 320, spotlight: false, yieldToUser: true,
};
```

## Returns

A `DevtoolsStore`:

| Member | Type | Description |
|---|---|---|
| `getSnapshot` | `() => DevtoolsState` | The current immutable snapshot. A new object per change. |
| `subscribe` | `(listener: () => void) => () => void` | Called after every change. Returns an unsubscribe function. |
| `refreshTools` | `() => void` | Re-read `getTools()`, the catalog tools, and each tool's control, fields and `match`. Coalesced to one microtask. The store also calls it on `toolchange`, URL changes and (debounced) DOM changes, and only publishes a snapshot when the tool views changed. |
| `runTool` | `(name: string, args?: Record<string, unknown>) => Promise<CallRecord>` | Run a tool as the agent would (cursor and all). Resolves with the finished record; never rejects. |
| `cancel` | `(id: string) => void` | Cancel a running or waiting call. Panel runs abort their signal; agent calls need `canCancel`. |
| `clearCalls` | `() => void` | Drop finished calls and all markers. Open calls stay. |
| `locate` | `(name: string) => boolean` | Scroll the tool's control (the one the cursor acts on, else its `toolname` element) into view and flash it. `false` when it isn't on screen. |
| `setSetting` | `<K extends keyof DevtoolsSettings>(key: K, value: DevtoolsSettings[K]) => void` | Change and persist one setting. `spotlight` and `yieldToUser` also go to `visuals`. |
| `resetLayout` | `() => void` | Dock position and size back to defaults. |
| `setRevealed` | `(on: boolean) => void` | Show (and copy) the values as they were. Does nothing outside a development build (`canReveal`). |
| `raw` | `(id: string) => RawCall \| undefined` | A call's `args`, `fills`, `result` and `error` before redaction. `undefined` outside a development build, and once the call has left the timeline. |
| `shown` | `(tool: string, args: unknown) => unknown` | `args` as the panel shows and copies them: redacted, unless `revealed`. |
| `destroy` | `() => void` | Stop listening and restore `window.agent`. Calls in flight still settle. Idempotent. |

### `window.agent`

Creating a store also sets `window.agent`, a console helper that plays the agent; `destroy()` restores the previous value. Calls made through it run through `runTool` (cursor and all) and appear on the timeline with origin `devtools`.

| Method | Returns | Description |
|---|---|---|
| `invoke(name, args?)` | `Promise<ModelContextToolResult \| undefined>` | Calls the tool the way an agent would. Resolves with the call's result, or `undefined` when it failed before producing one (an unknown tool): the error is on the timeline record. |
| `run(name, args?)` | `Promise<ModelContextToolResult \| undefined>` | The same function as `invoke`, kept under its earlier name. |
| `list()` | `Promise<ModelContextToolInfo[]>` | `document.modelContext.getTools()`, or `[]` without WebMCP. |

```js
await agent.invoke("add_to_cart", { quantity: 2 });
await agent.list();
```

### Types

| Type | Shape |
|---|---|
| `DevtoolsState` | `{ tools: ToolView[]; calls: CallRecord[]; markers: TimelineMarker[]; settings: DevtoolsSettings; supported: boolean; canCancel: boolean; hasVisuals: boolean; canReveal: boolean; revealed: boolean }`. `calls` and `markers` are newest first, capped at `maxCalls`. `supported`: `document.modelContext` exists. `canCancel`: `cancelTool` exists (the polyfill). `canReveal`: a development build (`process.env.NODE_ENV` is not `"production"`), where "Reveal values" exists. `revealed`: the panel shows values as they were. |
| `DevtoolsSettings` | `{ open: boolean; tab: DevtoolsTab; dock: "bottom" \| "right"; size: number; spotlight: boolean; yieldToUser: boolean }`. `size` is the height (bottom dock) or width (right dock) in px. |
| `DevtoolsTab` | `"tools" \| "timeline" \| "settings"` |
| `DevtoolsVisuals` | `Pick<AgentVisuals, "setSpotlight" \| "setYieldToUser">` |
| `ToolView` | `{ name; title?; description; schema: SchemaNode; annotations: Record<string, unknown>; kind: "declarative" \| "imperative"; onScreen: boolean; confirms: boolean; registered: boolean; control?: ControlView; fields?: FieldView[]; match?: string; fits: boolean; flags: FlagView[] }`. `onScreen`: the tool has a control on the page (its form, the control core resolves, or a `toolname` element). `confirms`: a declarative form without `toolautosubmit`, or a tool with `requireConfirmation`. `registered`: registered with `document.modelContext` right now (false for a catalog tool that is off here). `control` and `fields`: only for tools from `defineWebTool`. `match`: the tool's `match` as written; `fits`: it fits the current path (true without one). `flags`: the tool's flags as badges. |
| `ControlView` | `{ by: "target" \| "marker" \| "name" \| "call"; count: number; label: string; warn: boolean }`. How the control was found, how many matched, and the words the panel shows (`button · Add to cart`, `3 matches`, `none: runs unseen`, `none: confirmation fails`, `depends on the call`). `warn`: a confirm-gated tool with no control, or with several found by name. |
| `FieldView` | `{ name: string; field: string \| null }`. A parameter and the field it is typed into (`spinbutton · Quantity`), `null` when nothing is typed. |
| `FlagView` | `{ flag: "readOnly" \| "destructive" \| "repeatable" \| "external" \| "safeResponse"; label: string; title: string; warn?: boolean }`. A flag as a badge (`read-only`, `destructive`, `repeatable`, `external`, `untrusted answer`) with its tooltip. |
| `CallRecord` | `{ id; tool; origin: "devtools" \| "agent"; args?; fills: CallFill[]; status: CallStatus; startedAt; endedAt?; result?: ModelContextToolResult; error?; prompt? }`. Times are epoch ms. `prompt` is set while `status` is `waiting`. |
| `CallStatus` | `"running" \| "waiting" \| "ok" \| "error" \| "cancelled"`. `waiting`: the browser paused for the user's confirmation click. |
| `CallFill` | `{ field: string; value: string \| boolean; at: number }` |
| `TimelineMarker` | `{ id: string; type: "yield" \| "resume"; reason?: string; at: number }` |
| `DevtoolsStoreOptions` | The options table above. |

## Notes

- A record's `args`, `fills`, `result` and `error` are redacted when they are recorded, by the page's [redactor](../core/get-redactor.md) and the tool's [`sensitive`](../core/define-web-tool.md#options) fields, so the panel, "copy as code" and the TanStack bridge never carry a secret. In development the values as they were are kept beside the records, for "Reveal values" (`raw`). `window.agent.invoke` still resolves with the result as the tool gave it: it is the developer's own call.

- Creating a store sets [`window.agent`](#windowagent). `destroy()` restores the previous value.
- Without `document` (SSR) the store is inert.
- Core events carry no call id, so an event belongs to the newest unfinished call of its tool. Two concurrent calls
  of one tool may mix up.
- A result counts as an error when `isError` is set or its text starts with `Error:` or `Error [code]:`. A call that
  navigates the page resolves to the text `(navigated)`.
- Saved settings win over `initialSettings`. Saved `spotlight` and `yieldToUser` are applied to `visuals` on the next
  task; unsaved ones leave the app's own visuals options alone.
- If `localStorage` is blocked, settings still apply but are not persisted.

## See also

- [Devtools](../../build/devtools.mdx), the page that teaches the panel
- [`<WebAgentsDevtools>`](./web-agents-devtools.md): `useDevtoolsStore`, the React host
- [`installWebAgentsDevtools`](./install-web-agents-devtools.md)
- [`webAgentsEventClient`](./event-client.md): posting snapshots to TanStack's bus
- [`parseSchema`](./parse-schema.md): `SchemaNode`
- [`toAgentInvokeCode`](./copy-as-code.md): the snippets for `window.agent`
