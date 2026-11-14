/**
 * The cart: lines, promo code and placed orders, one store for the page, outside React. The page reads it through
 * `useCart()` (src/hooks/use-cart.ts); module-level tools import `cart` and call it directly, so the provider passes
 * them nothing. Persisted to
 * sessionStorage so a reload keeps a demo going. Every action returns a sentence for the agent and throws a readable
 * error on bad input (see cart-rules.ts).
 *
 * Actions read and write the latest state, not a render's: two calls in the same tick (an agent, then the person) must
 * both see each other's changes. Nothing touches the browser until the cart is first read (the module is imported
 * server-side too, through src/webmcp-agents/agents.ts).
 */
import { getProduct } from "../data/catalog.ts";
import { money } from "../lib/format.ts";
import {
  addLine,
  type CartLine,
  describeLines,
  findLine,
  lineLabel,
  PROMO_CODE,
  PROMO_RATE,
  resolveVariant,
  sameLine,
  type Totals,
  totalsFor,
} from "./cart-rules.ts";

export interface Contact {
  email: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  country: string;
  note?: string;
}

export interface Order {
  id: string;
  lines: CartLine[];
  totals: Totals;
  promo: string | null;
  contact: Contact;
  placedAt: number;
}

interface CartState {
  lines: CartLine[];
  promo: string | null;
  orders: Order[];
}

/** The cart's actions: the same object on every render. */
export interface CartActions {
  add(slug: string, qty: number, variant?: string | null): string;
  /** Qty 0 removes the line. */
  setQty(slug: string, variant: string | null | undefined, qty: number): string;
  remove(slug: string, variant?: string | null): string;
  applyPromo(code: string): string;
  removePromo(): string;
  /** Throws on an empty cart. */
  placeOrder(contact: Contact): Order;
  /** Human summary for get_cart. */
  describe(): string;
  /** How a line is named on screen ("Ocean Tee (M)"); throws when the cart has no such line. */
  labelOf(slug: string, variant?: string | null): string;
}

/** The cart as a render sees it: its state, its totals, and the actions. */
export interface CartApi extends CartActions {
  lines: readonly CartLine[];
  promo: string | null;
  totals: Totals;
  /** Items, not lines: 2 × tee + 1 × mug = 3. */
  count: number;
  orders: readonly Order[];
}

const STORAGE_KEY = "field-store:cart";
const EMPTY: CartState = { lines: [], promo: null, orders: [] };

function load(): CartState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as CartState | null;
    return saved && Array.isArray(saved.lines) ? { ...EMPTY, ...saved } : EMPTY;
  } catch {
    return EMPTY; // no storage (the server), or blocked
  }
}

const orderId = (): string => `FS-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

let state: CartState | undefined;
let view: CartApi | undefined;
const listeners = new Set<() => void>();
const current = (): CartState => {
  state ??= load();
  return state;
};

function commit(next: Partial<CartState>): CartState {
  state = { ...current(), ...next };
  view = undefined;
  try {
    // now, not later: the order page may read storage straight after an order
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // the cart still works for this visit
  }
  for (const listener of listeners) listener();
  return state;
}

function remove(slug: string, variant?: string | null): string {
  const line = findLine(current().lines, slug, variant);
  const { lines } = commit({ lines: current().lines.filter((l) => !sameLine(l, line.slug, line.variant)) });
  if (lines.length === 0) return `Removed ${lineLabel(line)}. The cart is empty.`;
  return `Removed ${lineLabel(line)}. ${lines.length} line${lines.length === 1 ? "" : "s"} left.`;
}

export const cart: CartActions = {
  add(slug, qty, variant) {
    const product = getProduct(slug);
    const option = resolveVariant(product, variant);
    const { lines, promo } = commit({ lines: addLine(current().lines, product, option, qty) });
    const count = lines.reduce((n, l) => n + l.qty, 0);
    return `Added ${qty} × ${lineLabel({ name: product.name, variant: option })} to the cart. The cart has ${count} item${count === 1 ? "" : "s"}, total ${money(totalsFor(lines, promo).total)}.`;
  },
  setQty(slug, variant, qty) {
    const line = findLine(current().lines, slug, variant);
    if (qty === 0) return remove(slug, line.variant);
    const product = getProduct(slug);
    // Re-add from zero, so the stock check covers the new quantity.
    const updated = addLine([], product, line.variant, qty)[0]!;
    const { lines, promo } = commit({ lines: current().lines.map((l) => (l === line ? updated : l)) });
    return `${lineLabel(line)} quantity is now ${qty}. Cart total ${money(totalsFor(lines, promo).total)}.`;
  },
  remove,
  applyPromo(input) {
    const code = input.trim().toUpperCase();
    if (!code) throw new Error("Enter a promo code.");
    if (code !== PROMO_CODE) throw new Error(`Promo code "${input.trim()}" is not valid.`);
    const { lines } = commit({ promo: code });
    const after = totalsFor(lines, code);
    return lines.length
      ? `Promo ${code} applied: ${PROMO_RATE * 100}% off. New total ${money(after.total)} (saved ${money(after.discount)}).`
      : `Promo ${code} applied: ${PROMO_RATE * 100}% off your order.`;
  },
  removePromo() {
    commit({ promo: null });
    return "Promo code removed.";
  },
  placeOrder(contact) {
    const { lines, promo, orders } = current();
    if (lines.length === 0) throw new Error("The cart is empty. Add something before checking out.");
    const order: Order = { id: orderId(), lines, totals: totalsFor(lines, promo), promo, contact, placedAt: Date.now() };
    commit({ lines: [], promo: null, orders: [...orders, order] });
    return order;
  },
  describe: () => describeLines(current().lines, current().promo),
  labelOf: (slug, variant) => lineLabel(findLine(current().lines, slug, variant)),
};

/** Calls `listener` after every change; returns the unsubscribe. */
export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cart as a render sees it: the same object until the next change (what `useSyncExternalStore` needs). */
export function cartSnapshot(): CartApi {
  if (view) return view;
  const { lines, promo, orders } = current();
  view = { ...cart, lines, promo, orders, totals: totalsFor(lines, promo), count: lines.reduce((n, l) => n + l.qty, 0) };
  return view;
}

/** Serializable cart for chat restore checkpoints (`getSnapshot`). */
export type CartCheckpoint = Pick<CartState, "lines" | "promo" | "orders">;

/** Capture the cart for a chat restore checkpoint. */
export function exportSnapshot(): CartCheckpoint {
  const { lines, promo, orders } = current();
  return { lines, promo, orders };
}

/** Rehydrate the cart from a chat restore checkpoint (`applySnapshot`). */
export function importSnapshot(data: CartCheckpoint): void {
  commit({
    lines: Array.isArray(data.lines) ? data.lines : [],
    promo: data.promo ?? null,
    orders: Array.isArray(data.orders) ? data.orders : [],
  });
}
