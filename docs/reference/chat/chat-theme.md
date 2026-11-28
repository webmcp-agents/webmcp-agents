---
description: "The chat's theme: every color, size, radius, shadow, duration and z-index as a --wa-chat-* variable, set from CSS, a plain object or JSON."
---

# `ChatTheme`

Every visual value of the chat is a `--wa-chat-*` CSS variable, and a `ChatTheme` is the same thing as data: each key
is one variable (`color.accentInk` → `--wa-chat-color-accent-ink`). Use it to restyle the chat without a fork and
without `!important`: set the variables in your CSS, or pass a theme object (JSON from a CMS works as is) to
[`<AgentChat theme>`](./agent-chat.md#props).

## Import

```ts
import { defineChatTheme, THEME_TOKENS } from "@webmcp-agents/chat";
import type { ChatTheme, ChatThemeInput } from "@webmcp-agents/chat";
```

## Example

The same theme three ways. In CSS, anywhere above the chat (`:root` works):

```css
:root {
  --wa-chat-color-accent: oklch(0.62 0.19 255);
  --wa-chat-radius-panel: 20px;
  --wa-chat-font-family: "Inter", system-ui, sans-serif;
}
```

As an object, one theme or one per color scheme:

```tsx
const theme = defineChatTheme({
  light: { color: { accent: "#0f62fe" }, radius: { panel: "16px" } },
  dark: { color: { accent: "#78a9ff" } },
});
// <AgentChat theme={theme} />
```

## Options

A `ChatTheme` has one group per kind of value; every key is optional. A `ChatThemeInput` is a `ChatTheme`, or
`{ light?: ChatTheme; dark?: ChatTheme }`.

| Name | Type | Default | Description |
|---|---|---|---|
| `color` | `Partial<Record<ColorKey, string>>` | the 0.4.0 palette | Surfaces, text, accent, bubbles, cards, the composer, the focus ring. |
| `font` | `Partial<Record<FontKey, string>>` | system UI, 14px | Families, sizes, line heights, weights. |
| `radius` | `Partial<Record<RadiusKey, string>>` | 14px panel | Corner radii. `bubble`, `card` and `control` follow `panel` unless set. |
| `space` | `Partial<Record<SpaceKey, string>>` | 2–20px | The distance from the viewport's edges, paddings, and a scale `xxs`…`xxl`. |
| `size` | `Partial<Record<SizeKey, string>>` | see the table | The panel, the launcher, controls, borders, the focus ring. |
| `shadow` | `Partial<Record<ShadowKey, string>>` | the 0.4.0 shadow | The panel, the launcher, the floating "Jump to latest" button, the chosen switch, the restore chip. |
| `motion` | `Partial<Record<MotionKey, string>>` | 0.15–1.6s | Easing, durations, and how far things move. Reduced motion turns movement off whatever these say. |
| `z` | `string` | just under the agent cursor | The chat's stacking order. |
| `zHandle` | `string` | `"1"` | The resize handle's stacking order inside the panel. |

Every key, its variable and its default:

| Key | Variable | Default |
|---|---|---|
| `color.bg` | `--wa-chat-color-bg` | `--wa-chat-bg` (0.4.0) |
| `color.fg` | `--wa-chat-color-fg` | `--wa-chat-fg` (0.4.0) |
| `color.muted` | `--wa-chat-color-muted` | `--wa-chat-muted` (0.4.0) |
| `color.soft` | `--wa-chat-color-soft` | `--wa-chat-soft` (0.4.0) |
| `color.line` | `--wa-chat-color-line` | `--wa-chat-line` (0.4.0) |
| `color.accent` | `--wa-chat-color-accent` | `--wa-chat-accent` (0.4.0) |
| `color.accentInk` | `--wa-chat-color-accent-ink` | `--wa-chat-accent-ink` (0.4.0) |
| `color.danger` | `--wa-chat-color-danger` | `--wa-chat-danger` (0.4.0) |
| `color.success` | `--wa-chat-color-success` | `--wa-chat-success` (0.4.0) |
| `color.userBubble` | `--wa-chat-color-user-bubble` | `color.accent` |
| `color.userBubbleInk` | `--wa-chat-color-user-bubble-ink` | `color.accentInk` |
| `color.assistantBubble` | `--wa-chat-color-assistant-bubble` | `color.soft` |
| `color.assistantBubbleInk` | `--wa-chat-color-assistant-bubble-ink` | `color.fg` |
| `color.toolBg` | `--wa-chat-color-tool-bg` | `transparent` |
| `color.toolLine` | `--wa-chat-color-tool-line` | `color.line` |
| `color.inputBg` | `--wa-chat-color-input-bg` | `color.bg` |
| `color.inputLine` | `--wa-chat-color-input-line` | `color.line` |
| `color.focusRing` | `--wa-chat-color-focus-ring` | `color.accent` |
| `color.overlay` | `--wa-chat-color-overlay` | `color.fg` mixed 6% into `color.bg` |
| `color.errorBg` | `--wa-chat-color-error-bg` | `color.danger` at 10% |
| `font.family` | `--wa-chat-font-family` | `--wa-chat-font` (0.4.0) |
| `font.mono` | `--wa-chat-font-mono` | `ui-monospace, "SF Mono", Menlo, monospace` |
| `font.size` | `--wa-chat-font-size` | `14px` |
| `font.sizeSmall` | `--wa-chat-font-size-small` | `13px` |
| `font.sizeXSmall` | `--wa-chat-font-size-x-small` | `12px` |
| `font.sizeTitle` | `--wa-chat-font-size-title` | `15px` |
| `font.sizeInput` | `--wa-chat-font-size-input` | `16px` |
| `font.lineHeight` | `--wa-chat-font-line-height` | `1.5` |
| `font.lineHeightTight` | `--wa-chat-font-line-height-tight` | `1.4` |
| `font.weight` | `--wa-chat-font-weight` | `500` |
| `font.weightStrong` | `--wa-chat-font-weight-strong` | `600` |
| `radius.panel` | `--wa-chat-radius-panel` | `--wa-chat-radius` (0.4.0) |
| `radius.bubble` | `--wa-chat-radius-bubble` | `radius.panel` − 2px (12px) |
| `radius.control` | `--wa-chat-radius-control` | `radius.panel` − 6px (8px) |
| `radius.launcher` | `--wa-chat-radius-launcher` | `999px` |
| `radius.card` | `--wa-chat-radius-card` | `radius.panel` − 4px (10px) |
| `radius.pill` | `--wa-chat-radius-pill` | `999px` |
| `space.gap` | `--wa-chat-space-gap` | `--wa-chat-gap` (0.4.0) |
| `space.pad` | `--wa-chat-space-pad` | `16px` |
| `space.padBubble` | `--wa-chat-space-pad-bubble` | `8px 12px` |
| `space.insetLeft` | `--wa-chat-space-inset-left` | set by the chat while docked |
| `space.insetRight` | `--wa-chat-space-inset-right` | set by the chat while docked |
| `space.insetBottom` | `--wa-chat-space-inset-bottom` | `space.gap` |
| `space.xxs` | `--wa-chat-space-xxs` | `2px` |
| `space.xs` | `--wa-chat-space-xs` | `4px` |
| `space.sm` | `--wa-chat-space-sm` | `6px` |
| `space.md` | `--wa-chat-space-md` | `8px` |
| `space.lg` | `--wa-chat-space-lg` | `10px` |
| `space.xl` | `--wa-chat-space-xl` | `12px` |
| `space.xxl` | `--wa-chat-space-xxl` | `14px` |
| `size.width` | `--wa-chat-size-width` | `400px` |
| `size.maxHeight` | `--wa-chat-size-max-height` | `620px` |
| `size.viewportGap` | `--wa-chat-size-viewport-gap` | `120px` |
| `size.dockWidth` | `--wa-chat-size-dock-width` | `380px` |
| `size.sheetHeight` | `--wa-chat-size-sheet-height` | `min(85dvh, 640px)` |
| `size.launcher` | `--wa-chat-size-launcher` | `52px` |
| `size.icon` | `--wa-chat-size-icon` | `36px` |
| `size.button` | `--wa-chat-size-button` | `36px` |
| `size.control` | `--wa-chat-size-control` | `32px` |
| `size.target` | `--wa-chat-size-target` | `24px` |
| `size.inputMinHeight` | `--wa-chat-size-input-min-height` | `40px` |
| `size.inputMaxHeight` | `--wa-chat-size-input-max-height` | `calc(6lh + 18px)` |
| `size.bubbleMax` | `--wa-chat-size-bubble-max` | `88%` |
| `size.dot` | `--wa-chat-size-dot` | `7px` |
| `size.typingDot` | `--wa-chat-size-typing-dot` | `6px` |
| `size.progress` | `--wa-chat-size-progress` | `6px` |
| `size.handle` | `--wa-chat-size-handle` | `8px` |
| `size.border` | `--wa-chat-size-border` | `1px` |
| `size.focusRing` | `--wa-chat-size-focus-ring` | `2px` |
| `size.focusOffset` | `--wa-chat-size-focus-offset` | `2px` |
| `size.accentBorder` | `--wa-chat-size-accent-border` | `3px` |
| `size.underlineOffset` | `--wa-chat-size-underline-offset` | `3px` |
| `shadow.panel` | `--wa-chat-shadow-panel` | `--wa-chat-shadow` (0.4.0) |
| `shadow.launcher` | `--wa-chat-shadow-launcher` | `shadow.panel` |
| `shadow.card` | `--wa-chat-shadow-card` | `shadow.panel` |
| `shadow.control` | `--wa-chat-shadow-control` | `0 1px 2px rgba(15, 23, 42, 0.12)` |
| `shadow.chip` | `--wa-chat-shadow-chip` | a 1 px ring of `color.line` and `0 1px 2px rgba(15, 23, 42, 0.08)` |
| `motion.ease` | `--wa-chat-motion-ease` | `--wa-chat-ease` (0.4.0) |
| `motion.duration` | `--wa-chat-motion-duration` | `0.18s` |
| `motion.durationFast` | `--wa-chat-motion-duration-fast` | `0.15s` |
| `motion.durationSlow` | `--wa-chat-motion-duration-slow` | `0.3s` |
| `motion.durationFade` | `--wa-chat-motion-duration-fade` | `120ms` |
| `motion.durationLoop` | `--wa-chat-motion-duration-loop` | `1.2s` |
| `motion.durationPulse` | `--wa-chat-motion-duration-pulse` | `1.6s` |
| `motion.offset` | `--wa-chat-motion-offset` | `8px` |
| `motion.slide` | `--wa-chat-motion-slide` | `16px` |
| `motion.bounce` | `--wa-chat-motion-bounce` | `3px` |
| `motion.pulse` | `--wa-chat-motion-pulse` | `12px` |
| `z` | `--wa-chat-z` | `calc(var(--agent-z, 2147483000) - 2)` |
| `zHandle` | `--wa-chat-z-handle` | `1` |

## Notes

- **How a value wins.** `chat.css` never declares these variables: it reads each one at the chat's root with its
  default as the fallback. So a value set on `:root`, on any ancestor, on your `className`, or by `theme` (inline on the
  root) applies, in that order of strength, with no specificity games. A token is read once, at the root: setting one on
  a single part does nothing; style that part with [`classNames` or a selector](./chat-parts.md) instead.
- **The 0.4.0 names still work.** `--wa-chat-accent`, `-accent-ink`, `-bg`, `-fg`, `-muted`, `-soft`, `-line`, `-danger`,
  `-success`, `-font`, `-radius`, `-shadow`, `-width`, `-gap`, `-ease`, `-z`, `-inset-left` and `-inset-right` are
  declared on `.wa-chat` exactly as before (with the same dark rules), and each is the default of its new token. A page
  that set them keeps what it had. `--wa-chat-radius` still draws only the panel; the bubble, card and control radii
  follow the new `--wa-chat-radius-panel`.
- **Light and dark.** A `{ light, dark }` theme is written as a stylesheet scoped to that chat: dark applies under the
  same conditions as the built-in dark palette (`prefers-color-scheme: dark` unless the chat is `data-theme="light"`, or
  `data-theme="dark"` on the chat or an ancestor), and [`colorScheme`](./agent-chat.md#props) forces one. A key only
  `light` sets falls back to its default in dark. A single theme applies in both schemes.
- **Docked room.** `space.insetLeft` / `space.insetRight` are written by the chat on `<html>` while it docks (with the
  0.4.0 `--wa-chat-inset-left` / `-right`): read them to keep your own fixed UI clear of the panel.
- **Data in, nothing else out.** A key that is not a token is ignored, and a value holding `;`, `{`, `}` or `!` is
  dropped, so a theme from JSON can never write an invalid property ([`themeToCssVars`](./theme-to-css-vars.md)).
- **Logical properties.** Layout uses `inline-start` / `inline-end`: in a right-to-left chat everything mirrors, the
  dock side included. `THEME_TOKENS` lists every variable suffix (`"color-accent"`, `"z"`…).
- `unstyled` turns all of this off: no class, no variable ([`ChatComponents`](./chat-components.md#notes)).

## See also

- [`themeToCssVars`](./theme-to-css-vars.md), the same theme as variables for a page without React
- [`defineChatTheme`](./define-chat-theme.md)
- [Chat parts](./chat-parts.md), to style one element
- [`<AgentChat>`](./agent-chat.md)
