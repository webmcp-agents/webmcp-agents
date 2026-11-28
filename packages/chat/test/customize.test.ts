/** The catalog, the translator and the theme helpers, without a page (R-CHAT-2, R-CHAT-3, R-CHAT-6). */
import { describe, expect, it, vi } from "vitest";
import { en } from "../src/customize/en";
import { isSchemedTheme, schemedThemeCss, themeToCssVars } from "../src/customize/theme";
import { THEME_TOKENS } from "../src/customize/tokens";
import { createTranslator, deepMerge, directionOf, safeLocale } from "../src/customize/translate";
import type { ChatMessagesInput, ChatTheme } from "../src/customize/types";
import { ar } from "../src/locales/ar";

describe("createTranslator", () => {
  it("fills a placeholder (R-CHAT-2: a placeholder)", () => {
    const t = createTranslator({ tool: { running: "Working on {tool}…" } });
    expect(t("tool.running", { tool: "add_to_cart" })).toBe("Working on add_to_cart…");
  });

  it("picks Arabic plural forms by the locale's rules, with # as the localized number (R-CHAT-2: Arabic plurals)", () => {
    const steps = "{count, plural, zero {لا خطوات} one {خطوة واحدة} two {خطوتان} few {# خطوات} many {# خطوة} other {# خطوة}}";
    const t = createTranslator({ steps }, "ar");
    const number = new Intl.NumberFormat("ar");
    expect(t("steps", { count: 0 })).toBe("لا خطوات");
    expect(t("steps", { count: 1 })).toBe("خطوة واحدة");
    expect(t("steps", { count: 2 })).toBe("خطوتان");
    expect(t("steps", { count: 3 })).toBe(`${number.format(3)} خطوات`);
    expect(t("steps", { count: 11 })).toBe(`${number.format(11)} خطوة`);
    // the shipped Arabic catalog has every form
    const shipped = createTranslator(ar, "ar");
    expect(new Set([0, 1, 2, 3, 11, 100].map((count) => shipped("steps", { count }))).size).toBe(6);
  });

  it("English plurals, and exact =N forms", () => {
    const t = createTranslator({ steps: "{count, plural, =0 {nothing yet} one {# step} other {# steps}}" });
    expect([0, 1, 2, 1234].map((count) => t("steps", { count }))).toEqual(["nothing yet", "1 step", "2 steps", "1,234 steps"]);
    expect(createTranslator()("steps", { count: 1 })).toBe("1 step");
  });

  it("calls a message function with its values (R-CHAT-2: a function)", () => {
    const t = createTranslator({ steps: ({ count }) => (count === 1 ? "1 step" : `${count} steps`) });
    expect(t("steps", { count: 1 })).toBe("1 step");
    expect(t("steps", { count: 4 })).toBe("4 steps");
  });

  it("a placeholder with no value is empty, never 'undefined' (R-CHAT-2: a value that is not given)", () => {
    const t = createTranslator({ tool: { running: "Working on {tool} for {who}" } });
    expect(t("tool.running", { tool: "x" })).toBe("Working on x for ");
    expect(t("tool.running")).toBe("Working on  for ");
  });

  it("a message function that throws shows English, and the chat keeps working (R-CHAT-2: a function that throws)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = createTranslator({
      composer: {
        send: (() => {
          throw new Error("boom");
        }) as unknown as string,
      },
      launcher: {
        open: () => {
          throw new Error("boom");
        },
      },
      steps: (() => 42) as unknown as string,
    });
    expect(t("composer.send")).toBe("Send");
    expect(t("launcher.open", { title: "Assistant" })).toBe("Open assistant");
    // not a string: English too
    expect(t("steps", { count: 2 })).toBe("2 steps");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("malformed plural syntax is shown as written, never undefined (R-CHAT-2: malformed plural syntax)", () => {
    const noOther = createTranslator({ steps: "{count, plural, one {# step}}" });
    expect(noOther("steps", { count: 1 })).toBe("1 step");
    expect(noOther("steps", { count: 5 })).toBe("");
    const unclosed = createTranslator({ steps: "{count, plural, one {# step} other {# steps}" });
    const out = unclosed("steps", { count: 5 });
    expect(typeof out).toBe("string");
    expect(out).not.toContain("undefined");
    expect(createTranslator({ steps: "{count, plural, one {# step} other {# steps}}" })("steps", { count: "nope" })).toBe("");
  });

  it("a missing or null key shows English; an unknown key is empty, never the key (R-CHAT-1: a missing key)", () => {
    const t = createTranslator({ composer: { send: null, stop: undefined }, title: null } as ChatMessagesInput);
    expect(t("composer.send")).toBe("Send");
    expect(t("composer.stop")).toBe("Stop");
    expect(t("title")).toBe("Assistant");
    expect(t("nope.never" as never)).toBe("");
    expect(t("composer" as never)).toBe("");
  });

  it("an invalid locale falls back to English formatting without throwing (R-CHAT-6: an invalid locale)", () => {
    for (const bad of ["not a locale", "", "x-", "en_US_bad_tag_!!"]) {
      const t = createTranslator({}, bad);
      expect(t.locale).toBe("en");
      expect(t.format.number(1234)).toBe("1,234");
    }
    expect(safeLocale("EN-us")).toBe("en-US");
  });

  it("formats numbers, percents and bytes for the locale", () => {
    const t = createTranslator({}, "en");
    expect(t.format.percent(0.42)).toBe("42%");
    expect(t.format.bytes(380e6)).toBe("380 MB");
    expect(t.format.bytes(1.4e9)).toBe("1.4 GB");
    expect(t.format.bytes(Number.NaN)).toBe("0 MB");
    const de = createTranslator({}, "de");
    expect(de.format.number(1234.5)).toBe("1.234,5");
    const arabic = createTranslator({}, "ar");
    expect(arabic.format.percent(0.42)).toBe(new Intl.NumberFormat("ar", { style: "percent" }).format(0.42));
  });

  it("knows which locales are written right to left", () => {
    for (const rtl of ["ar", "ar-EG", "he", "fa", "ur"]) expect(directionOf(rtl)).toBe("rtl");
    for (const ltr of ["en", "es", "de", "not a locale"]) expect(directionOf(ltr)).toBe("ltr");
  });
});

describe("deepMerge", () => {
  it("lays a partial override at any depth over the base, without changing either", () => {
    const merged = deepMerge(en, { composer: { send: "Go" }, errors: { network: "Offline." } });
    expect(merged.composer).toEqual({ ...en.composer, send: "Go" });
    expect(merged.errors.network).toBe("Offline.");
    expect(en.composer.send).toBe("Send");
  });

  it("takes only known keys of a usable kind: JSON can't add __proto__ or replace a group with a string", () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "composer": "nope", "errors": {"network": 5}, "extra": "x"}');
    const merged = deepMerge(en, evil) as typeof en & { extra?: string };
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(merged.composer).toEqual(en.composer);
    expect(merged.errors.network).toBe(en.errors.network);
    expect(merged.extra).toBeUndefined();
  });
});

describe("themeToCssVars", () => {
  it("maps each theme key to its variable (R-CHAT-3: a theme value becomes a variable)", () => {
    expect(themeToCssVars({ color: { accent: "red", accentInk: "#fff" }, radius: { panel: "20px" }, z: "10", zHandle: "2" })).toEqual({
      "--wa-chat-color-accent": "red",
      "--wa-chat-color-accent-ink": "#fff",
      "--wa-chat-radius-panel": "20px",
      "--wa-chat-z": "10",
      "--wa-chat-z-handle": "2",
    });
  });

  it("ignores keys that are not tokens and values that would break a declaration (R-CHAT-3: an unknown theme key)", () => {
    const fromJson = JSON.parse(
      '{"color": {"accent": "red; background: url(x)", "bg": "blue", "nope": "x"}, "nope": {"a": "b"}, "radius": "12px", "font": {"family": "Inter !important"}, "size": {"width": 400}}',
    ) as ChatTheme;
    expect(themeToCssVars(fromJson)).toEqual({ "--wa-chat-color-bg": "blue", "--wa-chat-size-width": "400" });
    expect(themeToCssVars(null as unknown as ChatTheme)).toEqual({});
  });

  it("every theme key has a token, and the token list has no duplicates", () => {
    expect(new Set(THEME_TOKENS).size).toBe(THEME_TOKENS.length);
    expect(THEME_TOKENS).toContain("color-accent");
    expect(THEME_TOKENS).toContain("z");
  });

  it("a { light, dark } theme becomes scoped rules: dark under the same conditions as the built-in palette", () => {
    const input = { light: { color: { accent: "#0f62fe", bg: "#fff" } }, dark: { color: { accent: "#78a9ff" } } };
    expect(isSchemedTheme(input)).toBe(true);
    expect(isSchemedTheme({ color: { accent: "red" } })).toBe(false);
    const css = schemedThemeCss(input, '.wa-chat[data-wa-theme="t1"]');
    // in token order: bg before accent
    expect(css).toContain('.wa-chat[data-wa-theme="t1"]{--wa-chat-color-bg:#fff;--wa-chat-color-accent:#0f62fe;}');
    expect(css).toContain('@media (prefers-color-scheme: dark){.wa-chat[data-wa-theme="t1"]:not([data-theme="light"]){');
    expect(css).toContain('.wa-chat[data-wa-theme="t1"][data-theme="dark"]');
    // light's bg is reset in dark: it falls back to the dark default instead of staying white
    expect(css).toContain("--wa-chat-color-bg:initial;");
  });
});
