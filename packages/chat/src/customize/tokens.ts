/**
 * The chat's design tokens: one list, read by the `ChatTheme` type, by `themeToCssVars` and by the stylesheet's test.
 * Every key becomes one CSS variable, `--wa-chat-<group>-<key in kebab-case>` (`color.accentInk` →
 * `--wa-chat-color-accent-ink`); `z` and `zHandle` are `--wa-chat-z` and `--wa-chat-z-handle`.
 *
 * `chat.css` never declares these public names: it reads each one with its default as the fallback, so a value set
 * anywhere above the chat (`:root`, an ancestor, the chat's own `style`) wins without `!important`.
 */

/** The groups of the theme and the keys of each, in the order the docs list them. */
export const THEME_GROUPS = {
  color: [
    "bg",
    "fg",
    "muted",
    "soft",
    "line",
    "accent",
    "accentInk",
    "danger",
    "success",
    "userBubble",
    "userBubbleInk",
    "assistantBubble",
    "assistantBubbleInk",
    "toolBg",
    "toolLine",
    "inputBg",
    "inputLine",
    "focusRing",
    "overlay",
    "errorBg",
  ],
  font: [
    "family",
    "mono",
    "size",
    "sizeSmall",
    "sizeXSmall",
    "sizeTitle",
    "sizeInput",
    "lineHeight",
    "lineHeightTight",
    "weight",
    "weightStrong",
  ],
  radius: ["panel", "bubble", "control", "launcher", "card", "pill"],
  space: ["gap", "pad", "padBubble", "insetLeft", "insetRight", "insetBottom", "xxs", "xs", "sm", "md", "lg", "xl", "xxl"],
  size: [
    "width",
    "maxHeight",
    "viewportGap",
    "dockWidth",
    "sheetHeight",
    "launcher",
    "icon",
    "button",
    "control",
    "target",
    "inputMinHeight",
    "inputMaxHeight",
    "bubbleMax",
    "dot",
    "typingDot",
    "progress",
    "handle",
    "border",
    "focusRing",
    "focusOffset",
    "accentBorder",
    "underlineOffset",
  ],
  shadow: ["panel", "launcher", "card", "control", "chip"],
  motion: [
    "ease",
    "duration",
    "durationFast",
    "durationSlow",
    "durationFade",
    "durationLoop",
    "durationPulse",
    "offset",
    "slide",
    "bounce",
    "pulse",
  ],
} as const;

/** The theme's single-value keys (not in a group). */
export const THEME_SINGLES = { z: "z", zHandle: "z-handle" } as const;

/** A theme group's name. */
export type ThemeGroup = keyof typeof THEME_GROUPS;

const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Every token's suffix (what follows `--wa-chat-`), e.g. `"color-accent-ink"`, `"z"`. The stylesheet test checks that
 * `chat.css` reads each one.
 */
export const THEME_TOKENS: readonly string[] = [
  ...Object.entries(THEME_GROUPS).flatMap(([group, keys]) => keys.map((key) => `${group}-${kebab(key)}`)),
  ...Object.values(THEME_SINGLES),
];

/** The CSS variable of a group key: `token("color", "accentInk")` → `"--wa-chat-color-accent-ink"`. */
export const tokenVar = (group: ThemeGroup, key: string): `--wa-chat-${string}` => `--wa-chat-${group}-${kebab(key)}`;
