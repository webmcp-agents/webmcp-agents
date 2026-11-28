/**
 * Message lookup and interpolation, with no dependency: `{name}` placeholders, ICU-style plurals
 * (`{count, plural, one {# step} other {# steps}}`, `=0 {…}` exact forms) resolved with `Intl.PluralRules`, and
 * message functions. Built to fail soft: nothing here throws, and nothing renders `undefined` or a key.
 */
import { en } from "./en";
import type { ChatFormat, ChatMessages, ChatMessagesInput, MessageKey, MessageValues, Translate } from "./types";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/**
 * `override` laid over `base`, key by key, at any depth. Only keys `base` has are taken (so JSON can't add
 * `__proto__`), and only values of a usable kind: a string or a function where `base` has a leaf, an object where it
 * has a group. `null`, `undefined` and anything else keep `base`'s value. Neither input is changed.
 *
 * @example
 * deepMerge(en, { composer: { send: "Go" } }).composer.send; // "Go"
 */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    if (UNSAFE_KEYS.has(key) || !Object.hasOwn(override, key)) continue;
    const from = (base as Record<string, unknown>)[key];
    const next = override[key];
    if (isPlainObject(from)) out[key] = deepMerge(from, next);
    else if (typeof next === "string" || typeof next === "function") out[key] = next;
  }
  return out as T;
}

/** Locales written right to left (by their language subtag). */
const RTL = new Set(["ar", "he", "iw", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);

/**
 * A usable BCP 47 tag: `tag` canonicalized, or "en" when it is missing or invalid (`Intl` throws on those), so
 * formatting never fails. `"EN-us"` → `"en-US"`, `"not a locale"` → `"en"`.
 */
export function safeLocale(tag: string | undefined | null): string {
  if (!tag || typeof tag !== "string") return "en";
  try {
    const [canonical] = Intl.getCanonicalLocales(tag.trim());
    if (!canonical) return "en";
    // some engines accept a tag the formatters still refuse
    new Intl.PluralRules(canonical);
    return canonical;
  } catch {
    return "en";
  }
}

/** The direction a locale is written in: "rtl" for Arabic, Hebrew, Persian, Urdu (and a few more), else "ltr". */
export function directionOf(locale: string): "ltr" | "rtl" {
  const language = safeLocale(locale).split("-")[0]!.toLowerCase();
  return RTL.has(language) ? "rtl" : "ltr";
}

/** Number, percent and byte formatting for `locale` (already safe). */
export function createFormat(locale: string): ChatFormat {
  const number = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  // what 0.4.0 printed in English: "380 MB", "1.4 GB"
  const mb = new Intl.NumberFormat(locale, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 0 });
  const gb = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "gigabyte",
    unitDisplay: "short",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const finite = (n: number): number => (Number.isFinite(n) ? n : 0);
  return {
    number: (value) => number.format(finite(value)),
    percent: (fraction) => percent.format(Math.round(finite(fraction) * 100) / 100),
    bytes: (bytes) => (finite(bytes) >= 1e9 ? gb.format(finite(bytes) / 1e9) : mb.format(Math.round(finite(bytes) / 1e6))),
  };
}

/** The entry at a dotted path, or `undefined`. */
function lookup(catalog: unknown, key: string): unknown {
  let at: unknown = catalog;
  for (const segment of key.split(".")) {
    if (!isPlainObject(at) || UNSAFE_KEYS.has(segment) || !Object.hasOwn(at, segment)) return undefined;
    at = at[segment];
  }
  return at;
}

const PLURAL = /\{(\w+),\s*plural,\s*((?:=?\w+\s*\{[^{}]*\}\s*)+)\}/g;
const FORM = /(=?\w+)\s*\{([^{}]*)\}/g;
const PLACEHOLDER = /\{(\w+)\}/g;

/** Fill a template: plurals first (their `#` is the localized count), then `{name}` placeholders. */
function fill(template: string, values: MessageValues, rules: Intl.PluralRules, format: ChatFormat): string {
  const show = (value: MessageValues[string]): string =>
    value === undefined || value === null ? "" : typeof value === "number" ? format.number(value) : String(value);
  return template
    .replace(PLURAL, (_match, name: string, body: string) => {
      const n = Number(values[name]);
      if (!Number.isFinite(n)) return "";
      const forms = Object.fromEntries([...body.matchAll(FORM)].map((f) => [f[1], f[2]])) as Record<string, string | undefined>;
      const form = forms[`=${n}`] ?? (n === 0 ? forms.zero : undefined) ?? forms[rules.select(n)] ?? forms.other ?? "";
      return form.replaceAll("#", format.number(n));
    })
    .replace(PLACEHOLDER, (_match, name: string) => show(values[name]));
}

/**
 * A translate function for `messages` laid over English, in `locale` (default "en"; an invalid tag is "en").
 * Lookups never return `undefined` or the key: a missing or `null` entry is the English one, an unknown key is `""`,
 * a placeholder without a value is `""`, a message function that throws (or returns something other than a string)
 * falls back to English, and malformed plural syntax is shown as written.
 *
 * @example
 * const t = createTranslator({ tool: { running: "Working on {tool}…" } }, "en");
 * t("tool.running", { tool: "add_to_cart" }); // "Working on add_to_cart…"
 *
 * const t2 = createTranslator(ar, "ar");
 * t2("steps", { count: 3 }); // "٣ خطوات"
 */
export function createTranslator(messages: ChatMessagesInput | null | undefined = {}, locale?: string): Translate {
  const resolved = safeLocale(locale);
  const catalog: ChatMessages = deepMerge(en, messages ?? {});
  const rules = new Intl.PluralRules(resolved);
  const format = createFormat(resolved);
  const english = resolved === "en" ? { rules, format } : { rules: new Intl.PluralRules("en"), format: createFormat("en") };

  const render = (entry: unknown, values: MessageValues, r: Intl.PluralRules, f: ChatFormat): string | undefined => {
    if (typeof entry === "string") return fill(entry, values, r, f);
    if (typeof entry === "function") {
      try {
        const out = entry(values);
        return typeof out === "string" ? out : undefined;
      } catch (err) {
        console.warn("[web-agents/chat] a message function threw; showing the English text instead:", err);
        return undefined;
      }
    }
    return undefined;
  };

  const t = ((key: MessageKey, values: MessageValues = {}) =>
    render(lookup(catalog, key), values, rules, format) ??
    render(lookup(en, key), values, english.rules, english.format) ??
    "") as Translate;
  return Object.defineProperties(t, {
    locale: { value: resolved, enumerable: true },
    messages: { value: catalog, enumerable: true },
    format: { value: format, enumerable: true },
  });
}
