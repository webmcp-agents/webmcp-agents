/**
 * Sentinel markers: a catalog whose every entry is `⟦its.path⟧`, so a render's text can be checked for anything that
 * did not come from the catalog. Shared by `renderChat` (which builds the catalog) and `toHaveNoHardcodedText` (which
 * reads the page); no import of the chat, so the matchers entry stays free of it.
 */

/** One marker: `⟦composer.send⟧`. Global, for `replace`. */
export const SENTINEL = /⟦[\w.]+⟧/g;

/** `value` with every string or function leaf replaced by `⟦path⟧`. */
export function sentinelOf(value: unknown, path = ""): unknown {
  if (typeof value === "string" || typeof value === "function") return `⟦${path}⟧`;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sentinelOf(v, path ? `${path}.${k}` : k)]));
}
