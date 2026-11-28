/**
 * The stylesheet, read as a file (so a Node test: a browser test cannot read it). R-CHAT-3: no raw value outside a
 * token declaration, logical properties only, every token read; R-CHAT-7: the 18 names of 0.4.0 still declared.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_TOKENS } from "../src/customize/tokens";

const source = readFileSync(fileURLToPath(new URL("../src/chat.css", import.meta.url)), "utf8");
/** The stylesheet without comments, and without the preludes of media queries (a breakpoint can't be a variable). */
const css = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/@media[^{]+\{/g, "@media {")
  .replace(/@supports[^{]+\{/g, "@supports {");
/** `value` with every parenthesized group (nested too) collapsed to one word. */
const flat = (value: string): string => {
  let out = value;
  while (/\([^()]*\)/.test(out)) out = out.replace(/\([^()]*\)/g, "f");
  return out;
};
/** What is left once every `--wa-chat-*` declaration (where raw values belong) is taken out. */
const outsideTokens = css.replace(/--wa-chat-[\w-]+\s*:[^;]+;/g, "");

/** The 18 variable names of 0.4.0 (design §5.3, the mapping table). */
const OLD_NAMES = [
  "accent",
  "accent-ink",
  "bg",
  "fg",
  "muted",
  "soft",
  "line",
  "danger",
  "success",
  "font",
  "radius",
  "shadow",
  "width",
  "gap",
  "ease",
  "z",
  "inset-left",
  "inset-right",
];

describe("chat.css", () => {
  it("has no raw color, length, duration or z-index outside token declarations (R-CHAT-3: no raw value)", () => {
    expect(outsideTokens).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i);
    expect(outsideTokens).not.toMatch(/(?<![\w-])-?\d*\.?\d+(?:px|rem|em|lh)\b/);
    // viewport units only as the whole viewport (100vw, 100dvh: an extent, not a size)
    expect(outsideTokens).not.toMatch(/(?<![\w.-])(?!100(?:d?v[wh])\b)-?\d*\.?\d+d?v[wh]\b/);
    expect(outsideTokens).not.toMatch(/(?<![\w-])\d*\.?\d+m?s\b/);
    expect(outsideTokens).not.toMatch(/z-index\s*:\s*-?\d/);
    // the design's own check, as written there
    expect(outsideTokens).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|oklch\(|\b\d+px\b(?!\s*\))/i);
  });

  it("uses logical properties only: no physical side, no physical shorthand (R-CHAT-3, R-CHAT-6)", () => {
    expect(css).not.toMatch(/(?<![\w-])(left|right|top|bottom)\s*:/);
    expect(css).not.toMatch(/(margin|padding|border)-(left|right|top|bottom)\b/);
    expect(css).not.toMatch(/text-align\s*:\s*(left|right)/);
    // four-value margin/padding/inset/border-width shorthands name physical sides in order
    for (const m of outsideTokens.matchAll(/(?<![\w-])(margin|padding|inset|border-width)\s*:\s*([^;]+);/g)) {
      const parts = flat(m[2]!).trim().split(/\s+/);
      expect(parts.length > 2 && new Set(parts).size > 1, `${m[1]}: ${m[2]}`).toBe(false);
    }
  });

  it("reads every token, with its default, through a private variable resolved on the chat's root (R-CHAT-3)", () => {
    for (const token of THEME_TOKENS) {
      if (token === "z") continue; // `--wa-chat-z` is a 0.4.0 name too: declared and read as is
      if (token === "space-inset-left" || token === "space-inset-right") {
        expect(css, token).toContain(`var(--wa-chat-${token}, var(--wa-chat-${token.replace("space-", "")}))`);
        continue;
      }
      expect(css, token).toMatch(new RegExp(`--wa-chat--${token}:\\s*var\\(--wa-chat-${token},`));
    }
    expect(css).toContain("z-index: var(--wa-chat-z)");
  });

  it("never declares a public token itself, so a value set above the chat (:root) wins", () => {
    for (const token of THEME_TOKENS) {
      if (token === "z") continue;
      expect(css, token).not.toMatch(new RegExp(`(^|[\\s;{])--wa-chat-${token}\\s*:`));
    }
  });

  it("still declares the 18 names of 0.4.0, and each feeds its token (R-CHAT-7: an old variable)", () => {
    for (const name of OLD_NAMES) {
      // set by the chat at run time (the docked width, the room the page makes), read here with a fallback
      if (name === "inset-left" || name === "inset-right" || name === "width") {
        expect(css, name).toMatch(new RegExp(`var\\(--wa-chat-${name}[,)]`));
        continue;
      }
      expect(css, name).toMatch(new RegExp(`--wa-chat-${name}\\s*:`));
    }
    expect(css).toContain("--wa-chat--color-accent: var(--wa-chat-color-accent, var(--wa-chat-accent));");
    expect(css).toContain("--wa-chat--color-accent-ink: var(--wa-chat-color-accent-ink, var(--wa-chat-accent-ink));");
    expect(css).toContain("--wa-chat--font-family: var(--wa-chat-font-family, var(--wa-chat-font));");
    expect(css).toContain("--wa-chat--radius-panel: var(--wa-chat-radius-panel, var(--wa-chat-radius));");
    expect(css).toContain("--wa-chat--shadow-panel: var(--wa-chat-shadow-panel, var(--wa-chat-shadow));");
    expect(css).toContain("--wa-chat--space-gap: var(--wa-chat-space-gap, var(--wa-chat-gap));");
    expect(css).toContain("--wa-chat--motion-ease: var(--wa-chat-motion-ease, var(--wa-chat-ease));");
  });

  it("stays unlayered, so an app's plain element rules never beat it", () => {
    expect(css).not.toMatch(/@layer/);
  });
});
