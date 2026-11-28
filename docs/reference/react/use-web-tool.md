---
description: "Registers a tool that lives in a component and closes over its state, while the component is mounted."
---

# `useWebTool`

Registers a tool that lives in a component and closes over its state, while the component is mounted. Pass the definition directly, as you would to [`defineWebTool`](../core/define-web-tool.md), or a tool that is already defined. Nothing is added to the JSX for the cursor: it finds the control by role and accessible name (the tool's `title`, or its id read as words) and types each parameter into the field with that `name` or label.

## Import

```ts
import { useWebTool } from "@webmcp-agents/react";
import type { UseWebToolOptions, WebToolState } from "@webmcp-agents/react";
```

## Example

The action is one function with two callers. When an agent calls `clear_cart`, the cursor finds the button named "Clear cart", parks on it, and `clear` runs only after the person's own click.

<include meta='title="components/clear-cart.tsx"'>/_examples/shared/components/clear-cart.tsx</include>

In Next.js the file starts with `"use client"`. A button of your own that runs the tool the way an agent would:

```tsx
const clearCart = useWebTool({ id: "clear_cart", /* … */ });

<Button onClick={() => clearCart.invoke()}>Try it</Button>;
```

A tool already made with [`defineWebTool`](../core/define-web-tool.md) in a file of its own is passed as it is, and is
on while the component is mounted (and `enabled`). Its `execute` reads only its input and module state, never the
component's:

<include meta='title="components/cart-panel.tsx" {10}'>/_examples/shared/components/cart-panel.tsx</include>

## Options

`useWebTool(tool, options?)`. The first argument is the definition; the second holds the hook's own options.

| Name | Type | Default | Description |
|---|---|---|---|
| `tool` | `WebToolConfig \| WebTool` | required | The definition, with every option of [`defineWebTool`](../core/define-web-tool.md#options): `id`, `title`, `description`, `inputSchema`, `execute`, and optionally `target`, `fields`, `fill`, `requireConfirmation`, `sensitive` (fields to [mask](../core/redact.md)) and the flags. One difference: `match` is ignored here, because the tool is on while the component is. A tool already made with `defineWebTool` is used as it is. |
| `enabled` | `boolean` | `true` | Register only while true, to switch the tool by state: `useWebTool(tool, { enabled: cart.items.length > 0 })`. While false the tool is released like an unmount releases it. |

## Returns

A `WebToolState`:

| Name | Type | Description |
|---|---|---|
| `invoke` | `WebTool["invoke"]` | Call the tool the way an agent would: the cursor moves, fields are typed, confirmation applies. Resolves to what `execute` returned; rejects when the call fails or the tool is not registered. The same function on every render, so it is safe in dependency arrays. |
| `registered` | `boolean` | The tool is registered with WebMCP. False until the effect runs, while `enabled` is false, and on pages without WebMCP. |
| `supported` | `boolean` | The page has `document.modelContext` (native, or the polyfill once it has loaded). False during server rendering. |

## Notes

- Calls always reach the latest render's `execute`, `target`, `fields` and `fill`, so new state never needs a re-registration (a `target` that closes over `cart` sees the current cart).
- It re-registers only when what the agent sees changes: id, title, description, input schema, flags and annotations, `requireConfirmation`, a non-function `target` (the [`webToolSignature`](../core/web-tool-signature.md)). A new definition replaces the old one at once, since Chrome would cancel its calls anyway.
- Disabling or unmounting releases the tool like the catalog does: a macrotask later (StrictMode's remount or a quick re-enable cancels it), and only after in-flight calls settle, plus 500 ms for the answer to reach the agent. A tool that disables itself (`clear_cart` emptying the cart) still answers.
- The signature is computed during render, so a bad schema throws at the component, not inside an effect.
- Works without a provider. Inside a [`<WebAgentsProvider>`](./web-agents-provider.md) it installs the provider's cursor before registering, so the tool is animated, and passes the provider's earlier-form `context` as `ctx.context`. Without one, nothing installs the cursor.
- Registering an id that is already registered replaces that registration (the newest wins). Do not give a component's tool the same id as a catalog tool.
- Inside a [`<WebAgentsProvider>`](./web-agents-provider.md) in a browser without WebMCP, the tool waits for the polyfill the provider loads and registers once it is there; `registered` turns true then. Without WebMCP and with no polyfill coming (no provider, or `polyfill={false}`), registration warns once (`document.modelContext is unavailable`) and does nothing, so the app still renders.
- A form is a tool with an `inputSchema`: React Hook Form and TanStack Form inputs hear the cursor's typing, and `fill: (values) => form.reset(values)` shows values in widgets it cannot type into. See [Tools with input](../../build/tools-with-input.mdx).
- With `requireConfirmation`, a trusted click on the tool's control runs the tool instead of the control's own `onClick`, so the action happens once. That includes a React Aria `Button`'s `onPress` and a `Link`'s navigation: the click React Aria re-fires is swallowed too. It needs exactly one matching control: give the tool a `title` that names one button, or a `target`.
- Icon-only buttons need an `aria-label`; a translated UI uses a function `target` returning the translated name.

## See also

- [Define a tool](../../build/define-a-tool.mdx), the page that teaches it
- [`defineWebTool`](../core/define-web-tool.md), every option of the definition
- [`locate`](../core/locate.md), how the control and the fields are found
- [`<WebAgentsProvider>`](./web-agents-provider.md), the cursor and the catalog
- [`deferRelease`](../core/defer-release.md), why unmounting never cancels a call
- [Tools with input](../../build/tools-with-input.mdx) and [Call a tool](../../build/call-a-tool.mdx)
