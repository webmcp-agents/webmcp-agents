/**
 * Search, selection and bookings: one store for the page, outside React (no React import: the tools import it, and
 * the agents file that lists them is read on the server). Components read it with `useBooking()` (src/hooks/use-booking.ts);
 * module-level tools import `booking` and call it directly, so the provider passes them nothing. The search in
 * progress (query, chosen flight, typed details) lives in sessionStorage so a reload on the booking page keeps it;
 * confirmed bookings live in localStorage so get_booking works later. Actions return a sentence for the agent and
 * throw readable errors.
 *
 * Actions read and write the latest state, not a render's: an agent's calls in quick succession must see each other's
 * changes. Nothing touches the browser until the store is first read.
 */
import {
  airline,
  airlineCodes,
  applyFilters,
  cheapest,
  describeFlight,
  type Fare,
  type Filters,
  type Flight,
  type FlightQuery,
  fareFor,
  generateFlights,
  NO_FILTERS,
  type SortKey,
  sortFlights,
} from "../data/flights";
import { todayIso } from "../lib/dates";
import { toResultsPath } from "../lib/search-params";

export interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}
export interface Traveler {
  firstName: string;
  lastName: string;
  /** YYYY-MM-DD */
  dob: string;
  document: string;
}
export type TravelerKind = "Adult" | "Child" | "Infant";

export interface Booking {
  ref: string;
  query: FlightQuery;
  flight: Flight;
  contact: Contact;
  travelers: Traveler[];
  fare: Fare;
  bookedAt: number;
}

interface State {
  query: FlightQuery | null;
  filters: Filters;
  sort: SortKey;
  selectedId: string | null;
  contact: Contact;
  travelers: Traveler[];
  bookings: Booking[];
}

export interface BookingApi {
  query: FlightQuery | null;
  /** Every flight for the query. */
  results: Flight[];
  /** Filtered and sorted: what the page shows. */
  visible: Flight[];
  filters: Filters;
  sort: SortKey;
  selected: Flight | null;
  contact: Contact;
  travelers: Traveler[];
  bookings: Booking[];
  /** A new search resets filters, sort and the selection. */
  setQuery(q: FlightQuery): void;
  setFilters(filters: Partial<Filters>): string;
  setSort(by: SortKey): string;
  /** Throws for an id that isn't in the current results. */
  select(id: string): Flight;
  saveDetails(contact: Contact, travelers: Traveler[]): string;
  /** Field names (`lastName_2`, `email`) still empty. */
  missingDetails(): string[];
  /** The search, its results and what the page shows, as of the latest action (not the last render). */
  view(): { query: FlightQuery | null; results: Flight[]; visible: Flight[] };
  /** Throws when nothing is selected or details are missing. */
  confirm(): Booking;
  getBooking(ref: string): Booking | undefined;
  /** Clear the current search (chat restore after search_flights). */
  clearSearch(): void;
  /** Clear the selected flight (chat restore after select_flight). */
  clearSelection(): void;
  /** Drop a confirmed booking by ref (chat restore after book_flight). */
  removeBooking(ref: string): void;
}

const SESSION_KEY = "skyline:search";
const BOOKINGS_KEY = "skyline:bookings";
const EMPTY_CONTACT: Contact = { firstName: "", lastName: "", email: "", phone: "" };
const EMPTY_TRAVELER: Traveler = { firstName: "", lastName: "", dob: "", document: "" };

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    return JSON.parse(storage().getItem(key) ?? "null") as T | null;
  } catch {
    return null; // no storage (the server), or blocked
  }
}

function load(): State {
  const session = read<Omit<State, "bookings">>(() => sessionStorage, SESSION_KEY);
  return {
    query: null,
    filters: NO_FILTERS,
    sort: "price-asc",
    selectedId: null,
    contact: EMPTY_CONTACT,
    travelers: [],
    ...session,
    bookings: read<Booking[]>(() => localStorage, BOOKINGS_KEY) ?? [],
  };
}

const travelerCount = (q: FlightQuery): number => q.adults + q.children + q.infants;

/** "Adult", "Adult", "Child", "Infant" for 2 adults, 1 child, 1 infant. */
export function travelerKinds(q: FlightQuery): TravelerKind[] {
  return [
    ...Array<TravelerKind>(q.adults).fill("Adult"),
    ...Array<TravelerKind>(q.children).fill("Child"),
    ...Array<TravelerKind>(q.infants).fill("Infant"),
  ];
}

const bookingRef = (): string =>
  `SK-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("")}`;

function summarize(visible: Flight[], total: number): string {
  if (visible.length === 0) return `No flights match (of ${total}). Loosen the filters.`;
  const names = [...new Set(visible.map((f) => airline(f.airline)?.name))].slice(0, 4).join(", ");
  return `Showing ${visible.length} of ${total} flights (${names}${visible.length > 4 ? ", …" : ""}). Cheapest: ${describeFlight(cheapest(visible)!)}.`;
}

const resultsOf = (s: State): Flight[] => (s.query ? generateFlights(s.query) : []);
const visibleOf = (s: State, results = resultsOf(s)): Flight[] => sortFlights(applyFilters(results, s.filters), s.sort);
function missingOf(s: State): string[] {
  const missing: string[] = (Object.keys(EMPTY_CONTACT) as (keyof Contact)[]).filter((k) => !s.contact[k].trim());
  const count = s.query ? travelerCount(s.query) : 0;
  for (let i = 0; i < count; i++) {
    const t = s.travelers[i] ?? EMPTY_TRAVELER;
    for (const k of Object.keys(EMPTY_TRAVELER) as (keyof Traveler)[]) if (!t[k].trim()) missing.push(`${k}_${i + 1}`);
  }
  return missing;
}

/** The store's actions: the same functions on every render. */
type Actions = Pick<
  BookingApi,
  | "setQuery"
  | "setFilters"
  | "setSort"
  | "select"
  | "saveDetails"
  | "missingDetails"
  | "view"
  | "confirm"
  | "getBooking"
  | "clearSearch"
  | "clearSelection"
  | "removeBooking"
>;

let state: State | undefined;
let api: BookingApi | undefined;
const listeners = new Set<() => void>();
const latest = (): State => {
  state ??= load();
  return state;
};

function write(storage: () => Storage, key: string, value: unknown): void {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // the store still works for this visit
  }
}

function commit(next: Partial<State>): State {
  state = { ...latest(), ...next };
  api = undefined;
  const { bookings, ...search } = state;
  write(() => sessionStorage, SESSION_KEY, search);
  // now, not later: the confirmation page may read storage first
  if (next.bookings) write(() => localStorage, BOOKINGS_KEY, bookings);
  for (const listener of listeners) listener();
  return state;
}

export const booking: Actions = {
  setQuery(q) {
    const s = latest();
    if (s.query && toResultsPath(s.query) === toResultsPath(q)) return;
    commit({ query: q, filters: NO_FILTERS, sort: "price-asc", selectedId: null, travelers: [] });
  },
  setFilters(filters) {
    const s = latest();
    if (!s.query) throw new Error("Search for flights first (search_flights).");
    // names → codes (throws on an unknown airline before anything changes), so the sidebar's checkboxes agree
    const airlines = filters.airlines ? airlineCodes(filters.airlines) : s.filters.airlines;
    const next = commit({ filters: { ...s.filters, ...filters, airlines } });
    return summarize(visibleOf(next), resultsOf(next).length);
  },
  setSort(by) {
    if (!latest().query) throw new Error("Search for flights first (search_flights).");
    const visible = visibleOf(commit({ sort: by }));
    return visible[0] ? `Sorted ${visible.length} flights. First: ${describeFlight(visible[0])}.` : "Sorted. No flights match the filters.";
  },
  select(id) {
    const wanted = id.trim().toUpperCase();
    const flight = resultsOf(latest()).find((f) => f.id === wanted);
    if (!flight) throw new Error(`No flight "${id}" in the current results. Use list_results for valid ids.`);
    commit({ selectedId: flight.id });
    return flight;
  },
  saveDetails(contact, travelers) {
    const next = commit({ contact, travelers });
    const missing = missingOf(next);
    const n = next.query ? travelerCount(next.query) : travelers.length;
    if (missing.length) return `Saved, but still missing: ${missing.join(", ")}.`;
    return `Saved details for ${n} traveler${n === 1 ? "" : "s"}. Next: book_flight (needs the user's confirmation).`;
  },
  missingDetails: () => missingOf(latest()),
  view: () => {
    const results = resultsOf(latest());
    return { query: latest().query, results, visible: visibleOf(latest(), results) };
  },
  confirm() {
    const s = latest();
    const flight = resultsOf(s).find((f) => f.id === s.selectedId);
    if (!s.query || !flight) throw new Error("No flight selected. Use select_flight first.");
    // the search may come back from sessionStorage a day later
    if (s.query.date < todayIso()) throw new Error(`This flight left on ${s.query.date}. Search again for a later date.`);
    const missing = missingOf(s);
    if (missing.length) throw new Error(`Missing traveler details: ${missing.join(", ")}. Call fill_traveler_details first.`);
    const confirmed: Booking = {
      ref: bookingRef(),
      query: s.query,
      flight,
      contact: s.contact,
      travelers: s.travelers.slice(0, travelerCount(s.query)),
      fare: fareFor(s.query, flight),
      bookedAt: Date.now(),
    };
    commit({ bookings: [...s.bookings, confirmed], selectedId: null, travelers: [], contact: EMPTY_CONTACT });
    return confirmed;
  },
  getBooking: (ref) => latest().bookings.find((b) => b.ref === ref.trim().toUpperCase()),
  clearSearch() {
    commit({
      query: null,
      filters: NO_FILTERS,
      sort: "price-asc",
      selectedId: null,
      travelers: [],
      contact: EMPTY_CONTACT,
    });
  },
  clearSelection() {
    commit({ selectedId: null, travelers: [], contact: EMPTY_CONTACT });
  },
  removeBooking(ref) {
    const wanted = ref.trim().toUpperCase();
    commit({ bookings: latest().bookings.filter((b) => b.ref !== wanted) });
  },
};

/** Calls `listener` after every change; returns the unsubscribe. For `useBooking`. */
export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The store as of the latest change: the same object until the next one. For `useBooking`. */
export function snapshot(): BookingApi {
  if (api) return api;
  const s = latest();
  const results = resultsOf(s);
  api = {
    ...booking,
    query: s.query,
    results,
    visible: visibleOf(s, results),
    filters: s.filters,
    sort: s.sort,
    selected: results.find((f) => f.id === s.selectedId) ?? null,
    contact: s.contact,
    travelers: s.travelers,
    bookings: s.bookings,
  };
  return api;
}

/** Serializable booking/search state for chat restore checkpoints (`getSnapshot`). */
export type BookingCheckpoint = State;

/** Capture search + bookings for a chat restore checkpoint. */
export function exportSnapshot(): BookingCheckpoint {
  return { ...latest() };
}

/** Rehydrate from a chat restore checkpoint (`applySnapshot`). */
export function importSnapshot(data: BookingCheckpoint): void {
  commit({
    query: data.query ?? null,
    filters: data.filters ?? NO_FILTERS,
    sort: data.sort ?? "price-asc",
    selectedId: data.selectedId ?? null,
    contact: data.contact ?? EMPTY_CONTACT,
    travelers: Array.isArray(data.travelers) ? data.travelers : [],
    bookings: Array.isArray(data.bookings) ? data.bookings : [],
  });
}
