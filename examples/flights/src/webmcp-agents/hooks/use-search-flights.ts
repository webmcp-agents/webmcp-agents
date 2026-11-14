/**
 * search_flights, on the home page and (compact) on a results page: one React Hook Form schema for the agent's call and
 * the person's submit; `search` is what both run. When an agent calls it, the cursor types each value into the field
 * named like its parameter (the trip and cabin selects, From, To, Depart, the traveler counters), presses "Search
 * flights", and the results page opens.
 *
 * Every field is a native control (native selects, `type="date"`, number inputs), so the cursor writes all of them and
 * the tool needs no `fill`. Searching only reads, so there is nothing to confirm. The return date is always in the
 * form (hidden for one-way trips). Airports may be codes or city names, and dates may come copied out of a sentence
 * ("Fri 2026-11-13."): `checkQuery` normalises them, or says what is wrong, to the agent and on the page alike.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { errorText } from "@webmcp-agents/core";
import { useWebTool, WebToolError } from "@webmcp-agents/react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AIRPORTS, CABINS, cheapest, describeFlight, type FlightQuery, generateFlights, TRIPS } from "../../data/flights";
import { addDays, formatDate, todayIso } from "../../lib/dates";
import { routeText } from "../../lib/itinerary";
import { navigate } from "../../lib/navigate";
import { checkQuery, toResultsPath } from "../../lib/search-params";
import { booking } from "../../store/booking";

// One schema checks the agent's call and the person's submit.
const schema = z.object({
  trip: z.enum(TRIPS).optional().describe("oneway or roundtrip (default oneway)"),
  cabin: z.enum(CABINS).optional().describe("Cabin class (default economy)"),
  from: z.string().describe("Origin airport, 3-letter code, e.g. LHR. Not given by the user? Call get_location first"),
  to: z.string().describe("Destination airport, 3-letter code, e.g. DXB"),
  date: z.string().describe("Departure date, YYYY-MM-DD, today or later. A relative date (next Friday)? get_time gives it"),
  returnDate: z.string().optional().describe("Return date, YYYY-MM-DD. Round trips only."),
  adults: z.number().int().optional().describe("Adults, 1–9 (default 1)"),
  children: z.number().int().optional().describe("Children aged 2–11, 0–8 (default 0)"),
  infants: z.number().int().optional().describe("Infants under 2 on a lap, at most one per adult (default 0)"),
});

/** The search form's values: the tool's input. */
export type SearchInput = z.infer<typeof schema>;

/** The agent's answer: how many, how many direct, the cheapest, and what to call next. */
function summary(q: FlightQuery): string {
  const flights = generateFlights(q);
  const best = cheapest(flights);
  const direct = flights.filter((f) => f.stops === 0).length;
  return [
    `Found ${flights.length} flights ${routeText(q)} on ${formatDate(q.date)} (${direct} direct).`,
    best ? `Cheapest: ${describeFlight(best)}.` : "",
    "Next: filter_results, sort_results, list_results or select_flight.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The search form and its tool. `initial` seeds the fields (a results page passes its URL's search).
 *
 * Returns `form` (React Hook Form), what the fields need (`today`, `trip`, `date`, the `airports` for the datalist),
 * the last search's `error`, `swap` (origin ⇄ destination) and `submit` for the form's `onSubmit`.
 */
export function useSearchFlights(initial?: FlightQuery) {
  const today = todayIso();
  const form = useForm<SearchInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      trip: initial?.trip ?? "oneway",
      cabin: initial?.cabin ?? "economy",
      from: initial?.from ?? "",
      to: initial?.to ?? "",
      date: initial?.date ?? addDays(today, 7),
      returnDate: initial?.returnDate ?? "",
      adults: initial?.adults ?? 1,
      children: initial?.children ?? 0,
      infants: initial?.infants ?? 0,
    },
  });

  // a change to any field clears the last search's error
  useEffect(() => {
    const subscription = form.watch(() => form.clearErrors("root"));
    return () => subscription.unsubscribe();
  }, [form]);

  const search = (input: SearchInput) => {
    let query: FlightQuery;
    try {
      query = checkQuery(input, today);
    } catch (err) {
      form.setError("root", { message: errorText(err) });
      throw new WebToolError("invalid_input", errorText(err));
    }
    // the store has the search before the results page renders: the results tools turn on with the URL, at once
    booking.setQuery(query);
    navigate(toResultsPath(query));
    return summary(query);
  };

  // An agent calls this.
  useWebTool({
    id: "search_flights",
    title: "Search flights",
    description:
      "Step 1 of booking: find flights between two airports on a date, from any page. Airports are 3-letter codes or city names; ask the user for a missing date or destination. Answers how many flights and the cheapest. Next: list_results for ids, or filter_results / sort_results.",
    inputSchema: schema,
    readOnly: true,
    execute: search,
    // chat restore: drop the search and go home
    revert: () => {
      booking.clearSearch();
      navigate("/");
    },
  });

  return {
    form,
    today,
    trip: form.watch("trip"),
    date: form.watch("date"),
    airports: AIRPORTS,
    error: form.formState.errors.root?.message,
    swap: () => {
      const { from, to } = form.getValues();
      form.setValue("from", to);
      form.setValue("to", from);
    },
    submit: form.handleSubmit((input) => {
      try {
        search(input);
      } catch {
        // shown under the form
      }
    }),
  };
}
