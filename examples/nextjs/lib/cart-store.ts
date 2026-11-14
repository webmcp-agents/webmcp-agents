/**
 * The cart: one store for the page, outside React, persisted to sessionStorage. Module-level tools import `cart` and
 * call it directly; components read it with `useCart()` (hooks/use-cart.ts). Every action returns a sentence for the agent
 * and throws a readable error on bad input. Actions read and write the latest state, not a render's: two calls in the
 * same tick (an agent, then the person) must both see each other's changes.
 *
 * No React and no "use client": the chat route imports the tools (through agents.ts) on the server, so this module
 * only touches the browser when the cart is first read there.
 */
import { getProduct, money, type Product } from "./catalog";

export interface CartLine {
  slug: string;
  variant: string | null;
  qty: number;
  name: string;
  /** Cents. */
  unitPrice: number;
}
export interface Totals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}
export interface Contact {
  email: string;
  name: string;
  address: string;
  country: string;
}
export interface Order {
  id: string;
  lines: CartLine[];
  totals: Totals;
  promo: string | null;
  contact: Contact;
}

export const PROMO_CODE = "WELCOME10";
const PROMO_RATE = 0.1;
const FREE_SHIPPING_FROM = 10_000;
const SHIPPING = 800;
export const MAX_QTY = 20;
const KEY = "field-store-next:cart";

export function totalsFor(lines: readonly CartLine[], promo: string | null): Totals {
  const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
  const discount = promo === PROMO_CODE ? Math.round(subtotal * PROMO_RATE) : 0;
  const shipping = lines.length === 0 || subtotal - discount >= FREE_SHIPPING_FROM ? 0 : SHIPPING;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

export const lineLabel = (l: Pick<CartLine, "name" | "variant">): string => (l.variant ? `${l.name} (${l.variant})` : l.name);

function resolveVariant(product: Product, variant: string | null | undefined): string | null {
  const axis = product.variants;
  const wanted = variant?.trim();
  if (!axis) {
    if (wanted) throw new Error(`${product.name} has no options; leave the variant out.`);
    return null;
  }
  if (!wanted) throw new Error(`Choose a ${axis.name} for ${product.name}: ${axis.options.join(", ")}.`);
  const match = axis.options.find((o) => o.toLowerCase() === wanted.toLowerCase());
  if (!match) throw new Error(`"${wanted}" isn't a ${axis.name} of ${product.name}. Choose ${axis.options.join(" or ")}.`);
  return match;
}

export function describeLines(lines: readonly CartLine[], promo: string | null): string {
  if (lines.length === 0) return promo ? `The cart is empty. Promo ${promo} is applied.` : "The cart is empty.";
  const t = totalsFor(lines, promo);
  const rows = lines.map(
    (l) => `- ${l.qty} × ${lineLabel(l)} [slug ${l.slug}${l.variant ? `, variant ${l.variant}` : ""}]: ${money(l.unitPrice * l.qty)}`,
  );
  if (promo) rows.push(`Promo ${promo}: −${money(t.discount)}`);
  rows.push(`Shipping: ${t.shipping ? money(t.shipping) : "free"}`);
  rows.push(`Total: ${money(t.total)}`);
  return rows.join("\n");
}

/** The cart's actions: the same object on every render. */
export interface CartActions {
  add(slug: string, qty: number, variant?: string | null): string;
  remove(slug: string): string;
  /** Qty 0 removes the line. Used by chat restore after add_to_cart. */
  setQty(slug: string, variant: string | null | undefined, qty: number): string;
  applyPromo(code: string): string;
  placeOrder(contact: Contact): Order;
  describe(): string;
}

/** The cart as a render sees it: its state, its totals, and the actions. */
export interface CartApi extends CartActions {
  lines: readonly CartLine[];
  promo: string | null;
  totals: Totals;
  count: number;
  orders: readonly Order[];
}

interface State {
  lines: CartLine[];
  promo: string | null;
  orders: Order[];
}
const EMPTY: State = { lines: [], promo: null, orders: [] };

let state: State | undefined;
let view: CartApi | undefined;
const listeners = new Set<() => void>();

function current(): State {
  if (state) return state;
  try {
    state = { ...EMPTY, ...(JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Partial<State>) };
  } catch {
    state = EMPTY; // no storage (the server), or blocked: a fresh cart
  }
  return state;
}

function commit(next: State): State {
  state = next;
  view = undefined;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the cart lives in memory
  }
  for (const listener of listeners) listener();
  return next;
}

export const cart: CartActions = {
  add(slug, qty, variant) {
    const product = getProduct(slug);
    const chosen = resolveVariant(product, variant);
    const { lines, promo } = current();
    const existing = lines.find((l) => l.slug === slug && l.variant === chosen);
    const max = Math.min(product.stock, MAX_QTY) - (existing?.qty ?? 0);
    if (product.stock === 0) throw new Error(`${product.name} is sold out.`);
    if (!Number.isInteger(qty) || qty < 1 || qty > max) throw new Error(`Quantity must be a whole number from 1 to ${max}, got ${qty}.`);
    const next = existing
      ? lines.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l))
      : [...lines, { slug, variant: chosen, qty, name: product.name, unitPrice: product.price }];
    commit({ ...current(), lines: next });
    const line = next.find((l) => l.slug === slug && l.variant === chosen)!;
    return `Added ${qty} × ${lineLabel(line)} to the cart (now ${line.qty}). ${describeLines(next, promo)}`;
  },
  remove(slug) {
    const { lines, promo } = current();
    if (!lines.some((l) => l.slug === slug)) throw new Error(`"${slug}" isn't in the cart.`);
    const next = lines.filter((l) => l.slug !== slug);
    commit({ ...current(), lines: next });
    return `Removed ${slug}. ${describeLines(next, promo)}`;
  },
  setQty(slug, variant, qty) {
    const { lines, promo } = current();
    const line = lines.find((l) => l.slug === slug && (variant == null || l.variant === variant));
    if (!line) throw new Error(`"${slug}" isn't in the cart.`);
    if (qty <= 0) {
      const next = lines.filter((l) => l !== line);
      commit({ ...current(), lines: next });
      return `Removed ${lineLabel(line)}. ${describeLines(next, promo)}`;
    }
    const next = lines.map((l) => (l === line ? { ...l, qty } : l));
    commit({ ...current(), lines: next });
    return `${lineLabel(line)} quantity is now ${qty}. ${describeLines(next, promo)}`;
  },
  applyPromo(code) {
    const trimmed = code.trim().toUpperCase();
    if (trimmed !== PROMO_CODE) throw new Error(`"${code}" isn't a valid promo code.`);
    const { lines } = commit({ ...current(), promo: trimmed });
    return `Applied ${trimmed}: 10% off. ${describeLines(lines, trimmed)}`;
  },
  placeOrder(contact) {
    const { lines, promo, orders } = current();
    if (lines.length === 0) throw new Error("The cart is empty.");
    const order: Order = {
      id: `FS-${(1000 + orders.length).toString(36).toUpperCase()}`,
      lines,
      totals: totalsFor(lines, promo),
      promo,
      contact,
    };
    commit({ lines: [], promo: null, orders: [...orders, order] });
    return order;
  },
  describe: () => describeLines(current().lines, current().promo),
};

/** For `useCart()`: be told of every change. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const viewOf = (s: State): CartApi => ({
  ...cart,
  lines: s.lines,
  promo: s.promo,
  orders: s.orders,
  totals: totalsFor(s.lines, s.promo),
  count: s.lines.reduce((n, l) => n + l.qty, 0),
});

/** For `useCart()`: the cart now. */
export function snapshot(): CartApi {
  view ??= viewOf(current());
  return view;
}

const serverView = viewOf(EMPTY);
/** For `useCart()` while hydrating: the empty cart the server rendered. */
export const serverSnapshot = (): CartApi => serverView;

/** Serializable cart for chat restore checkpoints (`getSnapshot`). */
export type CartCheckpoint = State;

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
