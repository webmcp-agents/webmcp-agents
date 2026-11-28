/**
 * Themes as CSS variables. A theme is data (JSON works); this turns it into `--wa-chat-*` declarations, ignoring
 * anything that is not a token and any value that could break out of a declaration.
 */
import { THEME_GROUPS, THEME_SINGLES, type ThemeGroup, tokenVar } from "./tokens";
import type { ChatMessagesInput, ChatTheme, ChatThemeInput } from "./types";

/** A CSS variable name of the chat. */
export type ChatCssVar = `--wa-chat-${string}`;

/** A value that stays one declaration: text or a number, and none of `;`, `{`, `}` or `!` (no `!important`). */
const usable = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return v && !/[;{}!]/.test(v) && !/[\r\n]/.test(v) ? v : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A theme as CSS variables, for an element's `style` (no React needed: SSR, a plain page). Keys that are not tokens are
 * ignored and values that are not one plain CSS value are dropped. Takes one theme; for light and dark, convert each.
 *
 * @example
 * Object.assign(document.documentElement.style, themeToCssVars({ color: { accent: "#e11d48" } }));
 * // or, server-rendered: <div style={themeToCssVars(theme)}>…
 */
export function themeToCssVars(theme: ChatTheme): Record<ChatCssVar, string> {
  const out: Record<ChatCssVar, string> = {};
  if (!isRecord(theme)) return out;
  for (const group of Object.keys(THEME_GROUPS) as ThemeGroup[]) {
    const values = theme[group];
    if (!isRecord(values)) continue;
    for (const key of THEME_GROUPS[group]) {
      const v = usable(values[key]);
      if (v !== undefined) out[tokenVar(group, key)] = v;
    }
  }
  for (const [key, suffix] of Object.entries(THEME_SINGLES)) {
    const v = usable(theme[key as keyof typeof THEME_SINGLES]);
    if (v !== undefined) out[`--wa-chat-${suffix}`] = v;
  }
  return out;
}

/** Whether a theme input is split by scheme (`{ light, dark }`) rather than one theme. */
export const isSchemedTheme = (input: ChatThemeInput): input is { light?: ChatTheme; dark?: ChatTheme } =>
  isRecord(input) && ("light" in input || "dark" in input) && !Object.keys(input).some((k) => k !== "light" && k !== "dark");

const declarations = (vars: Record<string, string>): string =>
  Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join("");

/**
 * The stylesheet for a `{ light, dark }` theme, scoped to one chat (`scope`, a selector of its root). Dark follows
 * the same rules as the built-in palette: an ancestor's or the chat's own `data-theme="dark"`, or the OS while the
 * chat's root is not `data-theme="light"`. A key only light sets is reset in dark, so it falls back to the default.
 */
export function schemedThemeCss(input: { light?: ChatTheme; dark?: ChatTheme }, scope: string): string {
  const light = themeToCssVars(input.light ?? {});
  const dark = themeToCssVars(input.dark ?? {});
  for (const name of Object.keys(light)) if (!(name in dark)) dark[name as ChatCssVar] = "initial";
  const rules: string[] = [];
  if (Object.keys(light).length) rules.push(`${scope}{${declarations(light)}}`);
  if (Object.keys(dark).length) {
    const body = declarations(dark);
    rules.push(`@media (prefers-color-scheme: dark){${scope}:not([data-theme="light"]){${body}}}`);
    rules.push(`[data-theme="dark"] ${scope}:not([data-theme="light"]),${scope}[data-theme="dark"]{${body}}`);
  }
  return rules.join("\n");
}

/**
 * A theme, typed: the identity function, for autocomplete and a type check where the theme is written.
 *
 * @example
 * const theme = defineChatTheme({ light: { color: { accent: "#0f62fe" } }, dark: { color: { accent: "#78a9ff" } } });
 */
export function defineChatTheme<T extends ChatThemeInput>(theme: T): T {
  return theme;
}

/**
 * A catalog override, typed: the identity function, for autocomplete and a type check where the messages are written.
 *
 * @example
 * const messages = defineChatMessages({ title: "Field Store assistant", errors: { rate_limited: "Give it a minute." } });
 */
export function defineChatMessages<T extends ChatMessagesInput>(messages: T): T {
  return messages;
}
