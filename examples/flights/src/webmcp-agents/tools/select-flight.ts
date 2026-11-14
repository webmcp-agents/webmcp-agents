/**
 * select_flight, on a results page (`match`): picks a flight and moves to the booking page. A tool that stops matching
 * is released only after its call is answered, so leaving the results page doesn't cancel this call. The cursor
 * presses that flight's own Select button, the one a screen reader calls "Select Meridian MR 210".
 */
import { defineWebTool } from "@webmcp-agents/core";
import { z } from "zod";
import { airline, describeFlight, fareFor, money } from "../../data/flights";
import { navigate } from "../../lib/navigate";
import { RESULTS_PATTERN, toResultsPath } from "../../lib/search-params";
import { booking } from "../../store/booking";

// An agent calls this.
export const selectFlight = defineWebTool({
  id: "select_flight",
  title: "Select a flight",
  description:
    "Choose one flight by its id and open its booking page. Needs: an id from list_results (search_flights first). Next: fill_traveler_details, then book_flight.",
  inputSchema: z.object({ flightId: z.string().describe("The flight's id exactly as list_results lists it, e.g. F-3K2") }),
  match: RESULTS_PATTERN,
  // which button? the one in that flight's card
  target: ({ flightId }) => {
    const flight = booking.view().results.find((f) => f.id === String(flightId).trim().toUpperCase());
    return flight && { role: "button", name: `Select ${airline(flight.airline)?.name ?? flight.airline} ${flight.flightNo}` };
  },
  execute: ({ flightId }) => {
    const flight = booking.select(flightId);
    navigate("/flights/booking");
    const { query } = booking.view();
    const fare = query ? ` Total ${money(fareFor(query, flight).total)} incl. taxes.` : "";
    return `Selected ${describeFlight(flight)}.${fare} Next: fill_traveler_details, then book_flight.`;
  },
  // chat restore: back to the results list for the same search
  revert: () => {
    const { query } = booking.view();
    booking.clearSelection();
    navigate(query ? toResultsPath(query) : "/");
  },
});
