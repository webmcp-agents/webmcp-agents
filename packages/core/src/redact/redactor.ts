/**
 * The redactor: one function that returns a redacted deep copy of anything, plus helpers for text, URLs, headers and
 * errors. Every library sink (the devtools log, the chat's tool card, URLs and console lines leaving the page, server
 * logs) passes data through the page's (or the server's) redactor last.
 *
 * It reduces accidental leakage; it is not a security boundary against a hostile page or a model that repeats data.
 */
import { mask, type RedactionStyle } from "./control";
import { SLOT, type Slot } from "./slot";

/** A value detector of your own, or a replacement for a built-in one. */
export interface PatternRule {
  /** What to find. A pattern without the `g` flag is used as if it had it (every match is replaced). */
  pattern: RegExp;
  /** Names the value in `"indexed"` tokens: `"ORDER"` → `"[ORDER_1]"`. */
  label: string;
  /** Keep a match unless this returns true (the card detector checks Luhn). A throw redacts the match. */
  validate?: (match: string) => boolean;
  /** This rule's own style. Default: the redactor's `style`. */
  style?: RedactionStyle;
}

/** Where a value is going, handed to `custom` so one rule can treat sinks differently. */
export type RedactKind = "tool-input" | "tool-output" | "fill" | "prompt" | "completion" | "url" | "error" | "attribute" | "log";

/** The built-in detectors. `phone` and `iban` are off by default: they match too much ordinary text. */
export type BuiltInPattern = "email" | "card" | "jwt" | "bearer" | "secretKey" | "phone" | "iban";

/** Options of {@link createRedactor} and `configureRedaction`. Every one is optional; the defaults are on. */
export interface RedactOptions {
  /**
   * Field names whose value is always redacted. Default {@link DEFAULT_SENSITIVE_KEYS}; pass a function to extend the
   * defaults (`(d) => [...d, "loyaltyId"]`), a list to replace them. Names are compared after lowercasing and dropping
   * everything but letters and digits (`"Api-Key"` → `"apikey"`), in two ways, so that a short entry cannot fire
   * inside a longer word:
   * 1. by words: the key is split into words (camelCase, `_`, `-`, `.`, spaces) and matches when its last one or more
   *    words, joined, equal an entry: `authToken`, `user_api_key`, `cardNumber`, `card_pin` match;
   * 2. by characters, for entries of five letters or more only: `accesstoken`, `userpassword`, `clientsecret` match.
   * So `timespan`, `japan`, `spin` and `tokenCount` are kept.
   */
  keys?: readonly string[] | ((defaults: readonly string[]) => readonly string[]);
  /** Names never redacted by name, checked first (`"tokenCount"`, `"sessionCount"`). Their values are still scanned. */
  allowKeys?: readonly string[];
  /**
   * Value detectors, run on every string. Default: `email`, `card` (Luhn-checked), `jwt`, `bearer`, `secretKey`
   * (`sk-…`, `ghp_…`, `AKIA…`) on; `phone` and `iban` off. `true` / `false` turns one on or off, a {@link PatternRule}
   * replaces it or adds one under a new name. `false` turns them all off.
   */
  patterns?: false | (Partial<Record<BuiltInPattern, boolean | PatternRule>> & Record<string, boolean | PatternRule>);
  /**
   * Exact paths whose value is redacted, `*` standing for one segment: `"output.*.address"`. A tool's input is under
   * `input`, its result under `output` (the redactor's `kind`); other values start at their own keys.
   */
  paths?: readonly string[];
  /** Query parameters whose values are kept in URLs. Default: none, so every query value is redacted in logs. */
  allowQuery?: readonly string[];
  /** Default `"full"`. */
  style?: RedactionStyle;
  /** What a redacted value becomes. Default `"[REDACTED]"`. */
  token?: string;
  /** Objects nested deeper than this become `"[Truncated]"`. Default 8. */
  maxDepth?: number;
  /** Longer strings are cut (with `…`), then scanned, which bounds the time a huge value takes. Default 8192. */
  maxStringLength?: number;
  /**
   * The last word on a value under a key (the root value itself is never given to it). Return `undefined` to keep the
   * library's result, anything else to use it as is. A throw redacts the value.
   */
  custom?: (value: unknown, ctx: { key?: string; path: string; kind: RedactKind; tool?: string }) => unknown;
}

/** Per call: what the value is and which extra names are sensitive for it (a tool's `sensitive` fields). */
export interface RedactContext {
  /** Where the value goes. `"tool-input"` and `"tool-output"` root `paths` at `input` and `output`. */
  kind?: RedactKind;
  /** The tool the value belongs to, for `custom`. */
  tool?: string;
  /** More field names to redact at any depth, compared like `keys` but whole (no word or suffix matching). */
  sensitive?: readonly string[];
}

/** Options of {@link Redactor.url}. */
export interface RedactUrlOptions {
  /**
   * `"log"` (default): every query value outside `allowQuery` is redacted, for telemetry, logs and attributes.
   * `"model"`: only a parameter that is sensitive by name (a key) or by value (a detector matches) is redacted, for
   * the URLs the model reads (the page's URL in a step request, the page-move note), so `?from=CAI&to=LHR` reaches it.
   */
  for?: "log" | "model";
}

/** A configured redactor. Call it on any value; it never mutates its input and never throws. */
export interface Redactor {
  /** A redacted deep copy. Cycles become `"[Circular]"`; a value that fails to read or to redact becomes the token. */
  <T>(value: T, ctx?: RedactContext): T;
  /** One string, scanned by the detectors (JSON inside it is parsed, redacted by key and written back). */
  text(value: string): string;
  /**
   * A URL: credentials and hash dropped, origin and path kept (the path scanned), query values redacted (see
   * {@link RedactUrlOptions}). A relative URL starting with `/` keeps its form; anything else is scanned as text.
   */
  url(value: string, options?: RedactUrlOptions): string;
  /** HTTP headers: sensitive names (`authorization`, `cookie`, `set-cookie`) redacted, every other value scanned. */
  headers(value: Record<string, string>): Record<string, string>;
  /** A loggable line from anything thrown: its message only, scanned. Provider errors can echo an API key. */
  error(value: unknown): string;
  /** A new redactor with these options over this one's (`keys` as a function receives this one's keys). */
  extend(options: RedactOptions): Redactor;
  /** The same rules with fresh `"indexed"` numbering: one scope per run or trace. */
  scope(): Redactor;
}

/**
 * Field names redacted by default. Short entries (four letters or fewer) match whole trailing words only, see
 * {@link RedactOptions.keys}.
 */
export const DEFAULT_SENSITIVE_KEYS: readonly string[] = Object.freeze(
  "password passwd passphrase secret token apikey accesskey privatekey credential credentials authorization cookie setcookie session sessionid jwt ssn cvv cvc cardnumber pan iban passport pin otp".split(
    " ",
  ),
);

const luhn = (match: string): boolean => {
  const digits = match.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = +digits[digits.length - 1 - i]!;
    if (i % 2) n = n > 4 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
};

/**
 * Built-in detectors, in the order they run (IBAN before phone: an IBAN's digits look like a phone number), each with
 * its label (the name in capitals) and whether it is on by default. Every repetition is bounded or followed by a
 * disjoint character, so no input makes them backtrack without end.
 */
const DETECTORS: Array<[BuiltInPattern, RegExp, boolean, ((m: string) => boolean)?]> = [
  ["email", /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+/g, true],
  ["card", /\b\d(?:[ -]?\d){12,18}\b/g, true, luhn],
  ["jwt", /\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g, true],
  ["bearer", /\bBearer\s+[\w.~+/-]+=*/gi, true],
  ["secretKey", /\b(?:sk[-_][\w-]{16,}|gh[pousr]_\w{20,}|AKIA[0-9A-Z]{16}\b)/g, true],
  ["iban", /\b[A-Z]{2}\d\d(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g, false],
  ["phone", /\+?\d[\d ().-]{6,18}\d/g, false],
];

const norm = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");
/** `"userApiKey"` → `["user", "api", "key"]`. */
const words = (key: string): string[] =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const join = (path: string, key: string | number): string => (path ? `${path}.${key}` : `${key}`);

/**
 * Build a redactor. With no options it is the library's default: sensitive field names, emails, cards, JWTs, bearer
 * credentials and provider keys redacted as `"[REDACTED]"`.
 *
 * @example
 * const redact = createRedactor({ keys: (d) => [...d, "loyaltyId"], style: "indexed" });
 * redact({ email: "a@x.com", loyaltyId: "L-99" }); // { email: "[EMAIL_1]", loyaltyId: "[LOYALTYID_1]" }
 * redact.url("https://shop.test/reset?token=abc#x"); // "https://shop.test/reset?token=[REDACTED]"
 */
export function createRedactor(options: RedactOptions = {}): Redactor {
  const { allowQuery = [], style = "full", token = "[REDACTED]", maxDepth = 8, maxStringLength = 8192, custom } = options;
  const keyList = typeof options.keys === "function" ? options.keys(DEFAULT_SENSITIVE_KEYS) : (options.keys ?? DEFAULT_SENSITIVE_KEYS);
  const keys = new Set(keyList.map(norm));
  const allow = new Set((options.allowKeys ?? []).map(norm));
  const paths = (options.paths ?? []).map(
    (p) =>
      new RegExp(
        `^${p
          .split(".")
          .map((s) => (s === "*" ? "[^.]+" : s.replace(/[^\w]/g, "\\$&")))
          .join("\\.")}$`,
      ),
  );
  const rules: PatternRule[] = [];
  const set = options.patterns;
  if (set !== false) {
    const own = { ...set } as Record<string, boolean | PatternRule | undefined>;
    for (const [name, pattern, on, validate] of DETECTORS) {
      if (typeof own[name] !== "object" && (own[name] ?? on)) rules.push({ pattern, label: name.toUpperCase(), validate });
      else if (own[name]) rules.push({ ...(own[name] as PatternRule) });
      delete own[name];
    }
    for (const rule of Object.values(own)) if (typeof rule === "object") rules.push({ ...rule });
    // copies (above): the app's own rule object is never changed
    for (const rule of rules) if (!rule.pattern.global) rule.pattern = new RegExp(rule.pattern.source, `${rule.pattern.flags}g`);
  }

  /** "indexed" tokens of this scope: label + value → token. Capped, so a long-lived page redactor cannot grow forever. */
  const index = new Map<string, string>();
  const counts: Record<string, number> = {};
  const replace = (value: string, label: string, as = style): string => {
    if (as !== "indexed") return mask(value, as, token);
    const id = `${label}\0${value}`;
    let out = index.get(id);
    if (!out) {
      if (index.size > 9999) return token;
      counts[label] = (counts[label] ?? 0) + 1;
      out = `[${label}_${counts[label]}]`;
      index.set(id, out);
    }
    return out;
  };

  const sensitiveKey = (key: string, extra?: readonly string[]): boolean => {
    const k = norm(key);
    if (allow.has(k)) return false;
    if (extra?.some((e) => norm(e) === k)) return true;
    const parts = words(key);
    for (let i = 0; i < parts.length; i++) if (keys.has(parts.slice(i).join(""))) return true;
    for (const s of keys) if (s.length > 4 && k.endsWith(s)) return true;
    return false;
  };

  const scan = (value: string): string => {
    let out = value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value;
    for (const rule of rules)
      out = out.replace(rule.pattern, (m) => {
        try {
          if (rule.validate && !rule.validate(m)) return m;
        } catch {
          // a failing rule redacts
        }
        return replace(m, rule.label, rule.style);
      });
    return out;
  };

  /** A string: JSON inside it is redacted by key, an absolute URL as a URL, anything else scanned. */
  const str = (value: string, ctx: RedactContext): string => {
    const s = String(value ?? "");
    const t = s.trim();
    if (/^[[{]/.test(t) && t.length <= maxStringLength)
      try {
        return JSON.stringify(walk(() => JSON.parse(t), "", undefined, ctx, 0, new WeakSet()));
      } catch {
        // not JSON after all
      }
    return /^https?:\/\//i.test(t) ? url(s) : scan(s);
  };

  const walk = (
    read: () => unknown,
    path: string,
    key: string | undefined,
    ctx: RedactContext,
    depth: number,
    seen: WeakSet<object>,
  ): unknown => {
    try {
      const value = read();
      // keyed values only: the root is never handed to `custom`, so a throwing rule redacts one field, not everything
      const own = key === undefined ? undefined : custom?.(value, { key, path, kind: ctx.kind ?? "attribute", tool: ctx.tool });
      if (own !== undefined) return own;
      if (key !== undefined && (sensitiveKey(key, ctx.sensitive) || paths.some((p) => p.test(path))))
        return replace(String(value ?? ""), norm(key).toUpperCase());
      if (typeof value === "string") return str(value, ctx);
      if (!value || typeof value !== "object" || value instanceof Date) return value;
      if (value instanceof Error) return error(value);
      if (seen.has(value)) return "[Circular]";
      if (depth >= maxDepth) return "[Truncated]";
      seen.add(value);
      const o = value as Record<string, unknown>;
      const out = Array.isArray(o)
        ? o.map((_, i) => walk(() => o[i], join(path, i), key, ctx, depth + 1, seen))
        : Object.fromEntries(Object.keys(o).map((k) => [k, walk(() => o[k], join(path, k), k, ctx, depth + 1, seen)]));
      seen.delete(value); // a value used twice (not a cycle) is copied twice
      return out;
    } catch {
      return token; // a value that cannot be read or redacted is never passed through
    }
  };

  const url = (value: string, { for: reader }: RedactUrlOptions = {}): string => {
    const s = String(value ?? "");
    const relative = s[0] === "/";
    let u: URL;
    try {
      u = new URL(s, relative ? "http://x" : undefined);
      if (!relative && !/^https?:$/.test(u.protocol)) throw 0;
    } catch {
      return scan(s);
    }
    // Built by hand, pair by pair: `URLSearchParams` decodes each pair here, but its serializer would percent-encode the
    // token (`%5BREDACTED%5D`) and re-encode the values that are kept. A kept value goes out exactly as it was written.
    const query = u.search
      .slice(1)
      .split("&")
      .filter(Boolean)
      .map((pair) => {
        const [[name, v] = ["", ""]] = new URLSearchParams(pair);
        return allowQuery.includes(name) || (reader === "model" && !sensitiveKey(name) && scan(v) === v)
          ? pair
          : `${pair.split("=")[0]}=${replace(v, norm(name).toUpperCase())}`;
      })
      .join("&");
    return `${relative ? "" : `${u.protocol}//${u.host}`}${scan(u.pathname)}${query ? `?${query}` : ""}`;
  };

  const error = (value: unknown): string => {
    try {
      return str(String(value instanceof Error ? value.message : ((value as { message?: unknown })?.message ?? value)), {});
    } catch {
      return token;
    }
  };

  const headers = (value: Record<string, string>): Record<string, string> =>
    walk(() => ({ ...value }), "", undefined, {}, 0, new WeakSet()) as Record<string, string>;

  const redactor = (<T>(value: T, ctx: RedactContext = {}): T =>
    walk(
      () => value,
      ctx.kind === "tool-input" ? "input" : ctx.kind === "tool-output" ? "output" : "",
      undefined,
      ctx,
      0,
      new WeakSet(),
    ) as T) as Redactor;
  redactor.text = (value) => str(value, {});
  redactor.url = url;
  redactor.headers = headers;
  redactor.error = error;
  redactor.extend = (more) =>
    createRedactor({
      ...options,
      ...more,
      keys: typeof more.keys === "function" ? more.keys(keyList) : (more.keys ?? keyList),
    });
  redactor.scope = () => createRedactor({ ...options, keys: keyList });
  return redactor;
}

/**
 * The page's redactor (in a browser) or the process's (on a server). Every library sink calls this at the moment it
 * writes, so a later {@link configureRedaction} applies to the next value. Default: `createRedactor()`.
 */
export function getRedactor(): Redactor {
  const slot = globalThis as Slot;
  slot[SLOT] ??= createRedactor();
  return slot[SLOT];
}

/**
 * Set the page's (or the process's) redaction rules: every library sink uses them from the next value on. A second
 * call replaces the first (options are not merged; use `getRedactor().extend(…)` to build on the current rules).
 * `<WebAgentsProvider redact>` calls it for you.
 *
 * @example
 * configureRedaction({ keys: (d) => [...d, "loyaltyId"], allowQuery: ["page", "sort"] });
 */
export function configureRedaction(options: RedactOptions | Redactor): void {
  (globalThis as Slot)[SLOT] = typeof options === "function" ? options : createRedactor(options);
}
