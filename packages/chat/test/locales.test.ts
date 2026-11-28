/** The shipped locales (R-CHAT-6: a shipped locale): complete, translated, and their own entries. */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../src/customize/en";
import type { ChatMessages } from "../src/customize/types";
import { ar } from "../src/locales/ar";
import { es } from "../src/locales/es";

const src = fileURLToPath(new URL("../src/", import.meta.url));

/** Every leaf of a catalog, by path. */
function leaves(value: unknown, path = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null) return [[path, value]];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

/** A value with no words of its own: only placeholders, punctuation and spaces ("{formatted}", ""). */
const wordless = (value: unknown): boolean => typeof value === "string" && !/\p{L}/u.test(value.replace(/\{[^}]*\}/g, ""));

describe.each([
  ["ar", ar],
  ["es", es],
] as [string, ChatMessages][])("the %s catalog", (_name, catalog) => {
  it("has exactly English's keys (a missing one is also a compile error: `satisfies ChatMessages`)", () => {
    expect(leaves(catalog).map(([k]) => k)).toEqual(leaves(en).map(([k]) => k));
  });

  it("translates every string: no value equals English by accident", () => {
    const english = new Map(leaves(en));
    const same = leaves(catalog).filter(([k, v]) => typeof v === "string" && !wordless(v) && v === english.get(k));
    expect(same).toEqual([]);
  });

  it("keeps every placeholder English has", () => {
    const english = new Map(leaves(en));
    for (const [key, value] of leaves(catalog)) {
      const from = english.get(key);
      if (typeof value !== "string" || typeof from !== "string") continue;
      const names = (s: string) => [...s.matchAll(/\{(\w+)[},]/g)].map((m) => m[1]).sort();
      expect(names(value), key).toEqual(names(from));
    }
  });
});

describe("tree shaking", () => {
  /** Every module `file` reaches through relative imports. */
  function graph(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    seen.add(file);
    const code = readFileSync(file, "utf8");
    for (const m of code.matchAll(/(?:import|export)\s[^"']*?from\s+["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const spec = m[1] ?? m[2]!;
      // type-only imports never reach the bundle
      if (/^(?:import|export)\s+type\s/.test(m[0])) continue;
      const base = resolve(dirname(file), spec);
      const found = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((p) => {
        try {
          return readFileSync(p) && true;
        } catch {
          return false;
        }
      });
      if (found) graph(found, seen);
    }
    return seen;
  }

  it("the main entry never imports a locale, so a page that does not import one does not ship it (R-CHAT-6)", () => {
    const reached = [...graph(join(src, "index.ts"))].map((f) => f.slice(src.length));
    expect(reached.length).toBeGreaterThan(20);
    expect(reached.filter((f) => f.startsWith("locales/"))).toEqual([]);
  });

  it("each locale is its own package entry", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
      exports: Record<string, Record<string, string>>;
    };
    expect(pkg.exports["./locales/ar"]?.["@webmcp-agents/source"]).toBe("./src/locales/ar.ts");
    expect(pkg.exports["./locales/es"]?.["@webmcp-agents/source"]).toBe("./src/locales/es.ts");
  });
});
