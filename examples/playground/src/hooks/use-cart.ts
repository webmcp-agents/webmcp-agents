import { useSyncExternalStore } from "react";
import { type CartState, cart, type Order } from "../store/cart";

export type { Order, Totals } from "../store/cart";

/** The cart as the page shows it: the store's state plus what the cart panel derives from it. */
export interface CartView extends CartState {
  /** How many units are in the cart (the badge). */
  count: number;
  isEmpty: boolean;
  /** Show the totals while there is something to total, or an applied code that can still be removed. */
  showTotals: boolean;
  /** The order placed last, for the panel's footer. */
  lastOrder: Order | undefined;
}

const snapshot = (): CartState => cart.state;

/**
 * The cart store, followed in React: re-renders on every change. The store itself (store/cart.ts) stays React-free so
 * tools can read and change it outside any component; this hook is the one place React subscribes to it.
 */
export function useCart(): CartView {
  const state = useSyncExternalStore(cart.subscribe, snapshot, snapshot);

  return {
    ...state,
    count: state.items.reduce((n, i) => n + i.qty, 0),
    isEmpty: state.items.length === 0,
    showTotals: state.items.length > 0 || state.promo !== null,
    lastOrder: state.orders.at(-1),
  };
}
