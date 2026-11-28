/**
 * The redactor's rules (design §8.5 with its [R3] cases): failure paths first, then the defaults.
 */
import { afterEach, describe, expect, it } from "vitest";
import { configureRedaction, createRedactor, DEFAULT_SENSITIVE_KEYS, getRedactor, isSensitiveControl, mask, type Redactor } from "./index";

const redact = createRedactor();

afterEach(() => configureRedaction({}));

describe("never throws, never leaks by failing", () => {
  it("does not mutate, survives cycles", () => {
    const input: Record<string, unknown> = { password: "x" };
    input.self = input;
    const out = redact(input);
    expect(input.password).toBe("x");
    expect(out.password).toBe("[REDACTED]");
    expect(out.self).toBe("[Circular]");
  });

  it("redacts the value a custom rule throws on, and goes on with the rest", () => {
    const r = createRedactor({
      custom: (_v, { key }) => {
        if (key === "a") throw new Error("bad rule");
        return undefined;
      },
    });
    expect(
      createRedactor({
        custom: () => {
          throw new Error("bad rule");
        },
      })({ a: 1 }),
    ).toEqual({ a: "[REDACTED]" });
    expect(r({ a: 1, b: 2 })).toEqual({ a: "[REDACTED]", b: 2 });
  });

  it("runs custom on keyed values only, and lets it have the last word", () => {
    const seen: string[] = [];
    const r = createRedactor({
      custom: (v, { key, path }) => {
        seen.push(path);
        return key === "loyalty" ? `L-${String(v).length}` : undefined;
      },
    });
    expect(r({ loyalty: "L-99", n: { m: 1 } }, { kind: "tool-input" })).toEqual({ loyalty: "L-4", n: { m: 1 } });
    expect(seen).toEqual(["input.loyalty", "input.n", "input.n.m"]);
  });

  it("returns awkward values without a throw; a throwing getter's value is the token", () => {
    const frozen = Object.freeze({ password: "p", ok: 1 });
    const getter = {
      ok: 1,
      get boom(): string {
        throw new Error("no");
      },
    };
    const value = {
      map: new Map([["password", "p"]]),
      set: new Set(["a@x.com"]),
      error: new Error("mail a@x.com"),
      big: 10n,
      bytes: new Uint8Array([1, 2]),
      getter,
      frozen,
      date: new Date(0),
      fn: () => 1,
      sym: Symbol("s"),
      nil: null,
      undef: undefined,
    };
    const out = redact(value) as Record<string, unknown>;
    expect(out.getter).toEqual({ ok: 1, boom: "[REDACTED]" });
    expect(out.frozen).toEqual({ password: "[REDACTED]", ok: 1 });
    expect(out.error).toBe("mail [REDACTED]");
    expect(out.big).toBe(10n);
    expect(out.date).toEqual(new Date(0));
    expect(out.nil).toBeNull();
    expect(JSON.stringify(out.map)).not.toContain('"p"');
    expect(JSON.stringify(out.set)).not.toContain("a@x.com");
  });

  it("redacts a match whose validate throws, and a pattern without the g flag replaces every match", () => {
    const thrower = createRedactor({
      patterns: {
        order: {
          pattern: /ORD-\d+/g,
          label: "ORDER",
          validate: () => {
            throw new Error("x");
          },
        },
      },
    });
    expect(thrower.text("a ORD-1 b ORD-2")).toBe("a [REDACTED] b [REDACTED]");
    const noG = createRedactor({ patterns: { order: { pattern: /ORD-\d+/, label: "ORDER" } } });
    expect(noG.text("ORD-1 and ORD-2")).toBe("[REDACTED] and [REDACTED]");
  });

  it("text, url, headers and error never throw on odd input", () => {
    expect(redact.text(undefined as unknown as string)).toBe("");
    expect(redact.url("not a url, mail a@x.com")).toBe("not a url, mail [REDACTED]");
    expect(redact.url(42 as unknown as string)).toBe("42");
    expect(redact.headers(null as unknown as Record<string, string>)).toEqual({});
    expect(redact.error(Object.create(null))).toBe("[REDACTED]");
    expect(redact.error(undefined)).toBe("undefined");
  });
});

describe("limits", () => {
  it("cuts deeper than maxDepth", () => {
    const r = createRedactor({ maxDepth: 2 });
    expect(r({ a: { b: { c: 1 } }, x: 1 })).toEqual({ a: { b: "[Truncated]" }, x: 1 });
    expect(r({ a: { b: 1 } })).toEqual({ a: { b: 1 } });
  });

  it("cuts strings longer than maxStringLength, then scans them", () => {
    const r = createRedactor({ maxStringLength: 12 });
    expect(r.text("a@x.com and much more")).toBe("[REDACTED] and …");
    expect(r.text("123456789012")).toBe("123456789012");
  });

  it("returns a 1 MB string in bounded time (no catastrophic backtracking)", () => {
    const r = createRedactor({ maxStringLength: 2 ** 21, patterns: { phone: true, iban: true } });
    for (const s of ["a".repeat(2 ** 20), `${"a.".repeat(2 ** 19)}@`, "1 ".repeat(2 ** 19), `eyJ${"a".repeat(2 ** 20)}`]) {
      const t = performance.now();
      r.text(s);
      // linear scanning takes ~0.3 s per MB; backtracking would take minutes. The margin is for a loaded CI machine.
      expect(performance.now() - t).toBeLessThan(15_000);
    }
    // The four scans take under 1 s alone and took 10.6 s on a CI runner busy with the other packages' tests,
    // so the default 5 s test timeout failed a linear scan. 60 s still fails a backtracking one.
  }, 60_000);
});

describe("keys", () => {
  it.each([
    [{ password: "hunter2" }, { password: "[REDACTED]" }],
    [{ "Api-Key": "abc" }, { "Api-Key": "[REDACTED]" }],
    [{ authToken: "abc" }, { authToken: "[REDACTED]" }],
    [{ tokenCount: 12 }, { tokenCount: 12 }],
    [{ note: "mail sara@example.com" }, { note: "mail [REDACTED]" }],
    [{ card: "4242 4242 4242 4242" }, { card: "[REDACTED]" }],
    [{ order: "1234 5678 9012 3456" }, { order: "1234 5678 9012 3456" }], // fails Luhn: not a card
    [{ body: '{"secret":"x","qty":2}' }, { body: '{"secret":"[REDACTED]","qty":2}' }],
  ])("redacts %j", (input, expected) => expect(redact(input)).toEqual(expected));

  it("matches short entries by whole trailing words only", () => {
    const kept = { timespan: 1, japan: "x", spin: 2, shipping: "y", captcha_pin_count: 3, keyboard: "k" };
    expect(redact(kept)).toEqual(kept);
  });

  it.each([
    "user_api_key",
    "x-auth-token",
    "cardNumber",
    "card_pin",
    "userPin",
    "accesstoken",
    "refreshtoken",
    "userpassword",
    "clientsecret",
    "sessionId",
    "Set-Cookie",
    "CVV",
  ])("redacts %s", (key) => expect(redact({ [key]: "v" })).toEqual({ [key]: "[REDACTED]" }));

  it("allowKeys win, extra keys extend, paths match one segment per *", () => {
    const r = createRedactor({ keys: (d) => [...d, "loyaltyId"], allowKeys: ["sessionCount", "password"], paths: ["output.*.address"] });
    expect(r({ sessionCount: 3, password: "p", loyalty_id: "L-99" })).toEqual({ sessionCount: 3, password: "p", loyalty_id: "[REDACTED]" });
    expect(r({ output: { home: { address: "1 Main St" }, address: "kept" } })).toEqual({
      output: { home: { address: "[REDACTED]" }, address: "kept" },
    });
    expect(r({ a: { address: "x" } }, { kind: "tool-output" })).toEqual({ a: { address: "[REDACTED]" } });
  });

  it("paths match inside a tool result's JSON text and its structuredContent, the envelope transparent", () => {
    const r = createRedactor({ paths: ["output.shipping.address", "output.*.zip"] });
    const result = { shipping: { address: "1 Main St", zip: "12345", city: "Cairo" } };
    const out = r({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result }, { kind: "tool-output" });
    const redacted = { shipping: { address: "[REDACTED]", zip: "[REDACTED]", city: "Cairo" } };
    expect(JSON.parse(out.content[0]!.text)).toEqual(redacted);
    expect(out.structuredContent).toEqual(redacted);
    // a JSON string under another key continues that key's path
    expect(createRedactor({ paths: ["body.card.holder"] })({ body: '{"card":{"holder":"Sara"}}' })).toEqual({
      body: '{"card":{"holder":"[REDACTED]"}}',
    });
  });

  it("JSON that needs no change comes back as written (formatting, big integers)", () => {
    const text = '{\n  "id": 12345678901234567890,\n  "qty": 2\n}';
    expect(redact.text(text)).toBe(text);
    expect(redact({ body: text })).toEqual({ body: text });
    expect(redact.text('{ "secret": "x", "qty": 2 }')).toBe('{"secret":"[REDACTED]","qty":2}');
  });

  it("allowKeys never unmask a field the tool marks sensitive", () => {
    const r = createRedactor({ allowKeys: ["passport", "password"] });
    expect(r({ passport: "A1234567", password: "p" }, { sensitive: ["passport"] })).toEqual({ passport: "[REDACTED]", password: "p" });
  });

  it("a key list replaces the defaults", () => {
    expect(createRedactor({ keys: ["pin"] })({ password: "p", pin: 1 })).toEqual({ password: "p", pin: "[REDACTED]" });
    expect(DEFAULT_SENSITIVE_KEYS).toContain("password");
  });

  it("ctx.sensitive adds names for one call", () => {
    expect(redact({ passport: "A1", nested: { bookingRef: "R1" } }, { sensitive: ["bookingRef"] })).toEqual({
      passport: "[REDACTED]",
      nested: { bookingRef: "[REDACTED]" },
    });
  });
});

describe("detectors", () => {
  it("redacts a JWT, a Bearer credential and provider keys", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij";
    expect(redact.text(`t ${jwt} e`)).toBe("t [REDACTED] e");
    expect(redact.text("Authorization: Bearer abc.def-123")).toBe("Authorization: [REDACTED]");
    for (const key of ["sk-proj-abcdefghijklmnop1234", "ghp_abcdefghijklmnopqrstuvwxyz0123", "AKIAABCDEFGHIJKLMNOP"])
      expect(redact.text(`key ${key}.`)).toBe("key [REDACTED].");
  });

  it("keeps a phone number and an IBAN until their detectors are on", () => {
    const s = "call +44 20 7946 0958, pay GB82 WEST 1234 5698 7654 32";
    expect(redact.text(s)).toBe(s);
    expect(createRedactor({ patterns: { phone: true, iban: true } }).text(s)).toBe("call [REDACTED], pay [REDACTED]");
  });

  it("patterns: false turns every detector off", () => {
    expect(createRedactor({ patterns: false }).text("a@x.com")).toBe("a@x.com");
  });

  it("keeps a trace readable with indexed tokens, numbered per scope", () => {
    const r = createRedactor({ style: "indexed" }).scope();
    expect(r({ from: "a@x.com", to: "b@x.com", cc: "a@x.com" })).toEqual({ from: "[EMAIL_1]", to: "[EMAIL_2]", cc: "[EMAIL_1]" });
    expect(r.scope()({ to: "b@x.com" })).toEqual({ to: "[EMAIL_1]" });
    expect(r({ password: "p" })).toEqual({ password: "[PASSWORD_1]" });
  });

  it("partial style and a custom token", () => {
    expect(createRedactor({ style: "partial" })({ card: "4242424242424242" })).toEqual({ card: "42••••42" });
    expect(createRedactor({ token: "***" })({ password: "p" })).toEqual({ password: "***" });
  });
});

describe("urls", () => {
  it("cleans URLs strictly: credentials and hash dropped, every query value outside allowQuery redacted", () => {
    expect(redact.url("https://user:pw@shop.test/reset?token=abc&page=2#frag")).toBe(
      "https://shop.test/reset?token=[REDACTED]&page=[REDACTED]",
    );
    expect(createRedactor({ allowQuery: ["page"] }).url("https://shop.test/list?page=2&email=a@b.co")).toBe(
      "https://shop.test/list?page=2&email=[REDACTED]",
    );
    expect(redact.url("/reset?token=abc#x")).toBe("/reset?token=[REDACTED]");
    expect(redact.url("https://shop.test/a?flag&x=")).toBe("https://shop.test/a?flag=[REDACTED]&x=[REDACTED]");
  });

  it("for the model: keeps what the model needs, drops secrets by name or by value", () => {
    expect(redact.url("/results?from=CAI&to=LHR&date=2026-12-20", { for: "model" })).toBe("/results?from=CAI&to=LHR&date=2026-12-20");
    expect(redact.url("https://user:pw@shop.test/reset?token=abc&email=a@b.co&page=2", { for: "model" })).toBe(
      "https://shop.test/reset?token=[REDACTED]&email=[REDACTED]&page=2",
    );
    expect(redact.url("https://shop.test/q?note=mail%20a%40b.co", { for: "model" })).toBe("https://shop.test/q?note=[REDACTED]");
    // a kept value goes out exactly as written: no re-encoding
    expect(redact.url("/s?q=a,b&tag=x%20y&flag", { for: "model" })).toBe("/s?q=a,b&tag=x%20y&flag");
  });

  it("for the model: a hash route is kept, its query and an OAuth fragment redacted like the query", () => {
    expect(redact.url("/#/results?from=CAI&to=LHR", { for: "model" })).toBe("/#/results?from=CAI&to=LHR");
    expect(redact.url("https://shop.test/app#/reset?token=abc&page=2", { for: "model" })).toBe(
      "https://shop.test/app#/reset?token=[REDACTED]&page=2",
    );
    expect(redact.url("https://shop.test/cb#access_token=abc&state=s1", { for: "model" })).toBe(
      "https://shop.test/cb#access_token=[REDACTED]&state=s1",
    );
    expect(redact.url("/inbox#a@b.co", { for: "model" })).toBe("/inbox#[REDACTED]");
    // logs still drop it
    expect(redact.url("/#/results?from=CAI")).toBe("/");
  });

  it("a URL inside a value is cleaned strictly; headers by name and value", () => {
    expect(redact({ link: "https://shop.test/reset?token=abc" })).toEqual({ link: "https://shop.test/reset?token=[REDACTED]" });
    expect(redact.headers({ Authorization: "Basic x", "x-trace": "a@x.com", accept: "json" })).toEqual({
      Authorization: "[REDACTED]",
      "x-trace": "[REDACTED]",
      accept: "json",
    });
  });
});

describe("error, extend, mask", () => {
  it("error: the message only, scanned", () => {
    expect(redact.error(new Error("401 for key sk-abcdefghijklmnopqrstu"))).toBe("401 for key [REDACTED]");
    expect(redact.error("plain a@x.com")).toBe("plain [REDACTED]");
    expect(redact.error({ message: "m" })).toBe("m");
  });

  it("extend merges over this redactor's options", () => {
    const base = createRedactor({ keys: (d) => [...d, "loyaltyId"] });
    const more = base.extend({ keys: (d) => [...d, "memberNo"], token: "#" });
    expect(more({ loyaltyId: 1, memberNo: 2, password: 3 })).toEqual({ loyaltyId: "#", memberNo: "#", password: "#" });
  });

  it("masks one value", () => {
    expect(mask("4242424242424242", "partial")).toBe("42••••42");
    expect(mask("1234567", "partial")).toBe("[REDACTED]");
    expect(mask("x")).toBe("[REDACTED]");
    expect(mask("x", "full", "••••")).toBe("••••");
  });
});

describe("the page's redactor", () => {
  it("is on by default and replaced by configureRedaction, every call", () => {
    expect(getRedactor()({ password: "p" })).toEqual({ password: "[REDACTED]" });
    configureRedaction({ keys: (d) => [...d, "loyaltyId"] });
    expect(getRedactor()({ loyaltyId: "L-99" })).toEqual({ loyaltyId: "[REDACTED]" });
    configureRedaction({ token: "#" });
    // a second call replaces the first: loyaltyId is no longer a key
    expect(getRedactor()({ loyaltyId: "L-99", password: "p" })).toEqual({ loyaltyId: "L-99", password: "#" });
    const own: Redactor = createRedactor({ token: "!" });
    configureRedaction(own);
    expect(getRedactor()).toBe(own);
  });
});

describe("without a DOM", () => {
  it("the control check answers false", () => {
    expect(isSensitiveControl({} as Element)).toBe(false);
    expect(isSensitiveControl(null as unknown as Element)).toBe(false);
  });
});
