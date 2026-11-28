/**
 * Deterministic ids. The chat (`newId` in @webmcp-agents/chat) reads an id source from a `globalThis` slot when one is
 * installed; `./setup` installs one and resets it before every test, so the same test makes the same message, call
 * and run ids every time (`u-1`, `a-1`, `call-1`…).
 */

/** The slot the library reads. Shared through `Symbol.for`, so source and dist copies of a package agree. */
export const ID_SLOT: unique symbol = Symbol.for("web-agents.ids") as never;

type IdSource = (prefix: string) => string;
type Slot = { [ID_SLOT]?: IdSource };

let counts = new Map<string, number>();

/** The kit's id source: per prefix, `prefix-1`, `prefix-2`… */
const sequence: IdSource = (prefix) => {
  const n = (counts.get(prefix) ?? 0) + 1;
  counts.set(prefix, n);
  return `${prefix}-${n}`;
};

/** Install the sequence on `globalThis` (idempotent). */
export function installIds(): void {
  (globalThis as Slot)[ID_SLOT] = sequence;
}

/** Start every prefix over at 1. */
export function resetIds(): void {
  counts = new Map();
}

/**
 * The next id for `prefix`: from the installed source when there is one (so the kit's mocks and the library share
 * one sequence), else from the kit's own.
 */
export const nextId = (prefix: string): string => ((globalThis as Slot)[ID_SLOT] ?? sequence)(prefix);
