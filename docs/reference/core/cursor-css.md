---
description: "The stylesheet for the visual layer: the ghost cursor, click ripple, name tag, focus ring, spotlight, the screen-reader live region, and the agent states on declarative forms. cursor-native.css adds Chrome's native states."
---

# `@webmcp-agents/core/cursor.css`

The stylesheet for the visual layer: the ghost cursor, click ripple, name tag, focus ring, spotlight, the screen-reader live region, and the agent states on declarative forms. Import it once next to [`installAgentVisuals`](./install-agent-visuals.md); the layer creates the elements, the stylesheet makes them visible. Override its custom properties to restyle the agent.

## Import

```ts
import "@webmcp-agents/core/cursor.css";
```

A CSS file exported as `@webmcp-agents/core/cursor.css` (the package lists `**/*.css` as having side effects). It uses only standard selectors, so every bundler takes it through its CSS pipeline: Vite, Next.js with Turbopack, TanStack Start, Astro.

Optional, for a page that runs Chrome's native WebMCP without the visuals (see [`cursor-native.css`](#cursor-nativecss) below):

```ts
import "@webmcp-agents/core/cursor-native.css";
```

## Example

Recolour the agent after the import. One property gives a cursor, tag, rings and soft fills in your brand blue; the others follow it unless you set them:

```css app.css
/* after importing @webmcp-agents/core/cursor.css */
:root {
  --agent: #1d4ed8;
}
```

## Options

The stylesheet has no JavaScript options; it is configured with custom properties on `:root`.

### Custom properties

| Name | Type | Default | Description |
|---|---|---|---|
| `--agent` | color | `#111111` | The agent's colour: fill for the arrow and the tag's background. The properties below default to it. |
| `--agent-ink` | color | `#ffffff` | Text on the tag. |
| `--agent-strong` | color | `var(--agent)` | Outlines, rings and borders. |
| `--agent-soft` | color | `--agent-strong` at 14% | Soft fill for the halo, ripple, ring flash and (at 3%) the form an agent is filling. A `color-mix()` of `--agent-strong`. |
| `--agent-wait` | color | `var(--agent)` | Colour while the cursor waits for the person's click. |
| `--agent-wait-soft` | color | `--agent-wait` at 18% | Soft fill while waiting for the person. A `color-mix()` of `--agent-wait`. |
| `--agent-edge` | color | `rgb(255 255 255 / 0.6)` | A 1 px light line around the ring and the ripple, like the arrow's white edge, so a dark agent stays visible on a dark page. `transparent` removes it. |
| `--agent-ease-out` | easing | `cubic-bezier(0.22, 1, 0.36, 1)` | Easing for fades. |
| `--agent-z` | integer | `2147483000` | Base z-index for the cursor, ripple and tag; the ring sits at `calc(var(--agent-z) - 1)`, the spotlight at `calc(var(--agent-z) - 2000)`. Devtools and chat render at `calc(var(--agent-z) + 100)`, so raise it only if you must sit above them. |

### Spotlight properties

The layer sets these inline from the `spotlight` option of [`installAgentVisuals`](./install-agent-visuals.md#options); you do not set them yourself.

| Name | Type | Default | Description |
|---|---|---|---|
| `--agent-spot-blur` | length | `4px` | Blur of the rest of the page while the spotlight is on. |
| `--agent-spot-dim` | number | `0.08` | Darkening of the rest of the page, 0 to 1. |

## Returns

What it styles:

| Selector | What |
|---|---|
| `.agent-cursor`, `.agent-cursor__arrow`, `.agent-cursor__halo` | The arrow (black with a white edge) and the halo that breathes while waiting. Position and tilt are written by script; CSS owns opacity and colour. |
| `.agent-ripple` | The click ripple at the tip. |
| `.agent-tag` | The name tag. Hidden when empty. |
| `.agent-ring` | The focus ring that glides between elements; flashes on click, pulses while waiting. |
| `.agent-spotlight` | The blur and dim layer, 2000 below `--agent-z`. Never takes pointer events. |
| `.agent-sr-only` | The visually hidden live region for screen readers. |
| `form[data-tool-form-active]` | The form the agent is filling (the polyfill sets the attribute): dashed outline. |
| `button[data-tool-submit-active]` | The submit button the polyfill paused on. |
| `[data-agent-active]` | The control the cursor is working on (or parked on, waiting for the person's click) while a tool runs. Set by the layer; not a hook to add yourself. |

State classes the layer toggles: `is-visible`, `is-waiting`, `is-flashing`, and `is-yielded` (the cursor and tag fade in 80 ms when the person takes over).

## Notes

- Under `prefers-reduced-motion: reduce`, transitions shrink to a 0.1 s opacity fade and the halo, ring wait and ring flash animations stop.
- Set the properties on `:root`, where the stylesheet declares them: the derived ones (`--agent-strong`, `--agent-soft`, `--agent-wait`, `--agent-wait-soft`) are computed there, so `--agent` set on a deeper element does not reach them.
- The ring, tag and ripple are `box-sizing: border-box` themselves: they sit the same on a page with no CSS reset.
- The stylesheet is unlayered on purpose: an app's plain `button { color: inherit }` beats any `@layer` rule, so layered library rules would lose to an app's reset.

### `cursor-native.css`

`@webmcp-agents/core/cursor-native.css` is a second, optional stylesheet with the same dashed outlines for Chrome's native WebMCP pseudo-classes: `form:tool-form-active` (the form an agent is filling) and `button:tool-submit-active` (the submit button the browser paused on). The polyfill mirrors them as `data-tool-form-active` and `data-tool-submit-active`, which `cursor.css` styles.

- **When you need it:** only on a page that runs Chrome's native WebMCP without [`installAgentVisuals`](./install-agent-visuals.md). With the visuals installed, the cursor, its ring and the parked state already show both states, and `cursor.css` styles `[data-agent-active]` and the polyfill's attributes.
- **Why it is a separate file:** some CSS parsers refuse a pseudo-class they do not know. Turbopack (Next.js) fails the build on it, and Vite 8's Lightning CSS warns and keeps the rule. Keeping the pseudo-classes out of `cursor.css` lets that file import everywhere. Where your bundler refuses `cursor-native.css`, serve it as a static file and link it, or leave it out.
- Each pseudo-class is in a rule of its own, because a browser that does not know one drops the whole rule. Its colours read `--agent-strong` and `--agent-wait`, with the same defaults, so it also works without `cursor.css`.

## See also

- [Style the cursor and the chat](../../build/style-the-cursor-and-chat.mdx), a worked example with dark mode
- [The agent cursor](../../concepts/agent-cursor.mdx)
- [`installAgentVisuals`](./install-agent-visuals.md)
- [`UI_HOST_ATTR`](./ui-host-attr.md)
