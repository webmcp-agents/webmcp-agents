/**
 * book_flight, on the booking page. Booking spends money, so `requireConfirmation`: the cursor ticks the fare rules
 * (the checkbox named `acceptTerms`), parks on "Book flight · USD …" (found by the tool's title, which the button's text
 * starts with), and the flight is booked only by the person's own click. Missing traveler details are an error for the
 * agent (naming the fields) and focus the first missing field for the person.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { errorText } from "@webmcp-agents/core";
import { useWebTool, WebToolError } from "@webmcp-agents/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { money } from "../../data/flights";
import { navigate } from "../../lib/navigate";
import { booking } from "../../store/booking";
import { detailsFrom, TRAVELER_DETAILS_FORM } from "./use-traveler-details";

const schema = z.object({
  acceptTerms: z.boolean().describe("The traveler accepts the fare rules. Must be true to book."),
});

type BookInput = z.infer<typeof schema>;

export interface UseBookFlightOptions {
  /** The fare's total, in cents: the agent's answer says what was paid. */
  total: number;
  /** How many travelers: a person's unsaved details are read for this many before booking. */
  travelers: number;
  /** Called just before the page moves to the booking (booking clears the selection the page shows). */
  onBooked(): void;
}

/**
 * The booking form (React Hook Form) and its confirm-gated tool.
 *
 * Returns `form`, the last attempt's `error` (`termsError` when it was the unticked fare rules), `clearError` (the
 * person changes the box) and `submit` for the form's `onSubmit`.
 */
export function useBookFlight({ total, travelers, onBooked }: UseBookFlightOptions) {
  const form = useForm<BookInput>({ resolver: zodResolver(schema), defaultValues: { acceptTerms: false } });
  const error = form.formState.errors.root?.message;

  const book = ({ acceptTerms }: BookInput) => {
    const fail = (message: string): never => {
      form.setError("root", { message });
      throw new WebToolError("failed", message);
    };
    if (!acceptTerms) return fail("Accept the fare rules to book (acceptTerms: true).");
    const missing = booking.missingDetails();
    if (missing.length) {
      document.querySelector<HTMLInputElement>(`#${TRAVELER_DETAILS_FORM} [name="${missing[0]}"]`)?.focus();
      return fail(`Missing traveler details: ${missing.join(", ")}. Call fill_traveler_details first, or fill them in and save.`);
    }
    let ref = "";
    try {
      ref = booking.confirm().ref;
    } catch (err) {
      fail(errorText(err));
    }
    onBooked(); // the page keeps showing this flight until it moves on
    form.clearErrors("root");
    navigate(`/bookings/${ref}`);
    return `Booked ${ref}: ${money(total)} paid. Use get_booking with ${ref} for the itinerary.`;
  };

  // An agent calls this.
  useWebTool({
    id: "book_flight",
    title: "Book flight",
    description:
      "Book and pay for the selected flight. Needs: select_flight, then fill_traveler_details. The user confirms on the page (Book flight).",
    inputSchema: schema,
    requireConfirmation: true,
    // the ticked box in the form's state too, before the person confirms
    fill: (values) => form.reset(values),
    execute: book,
    // chat restore: drop the booking that was just created
    revert: (_input, { output }) => {
      const text = typeof output === "string" ? output : "";
      const ref = text.match(/\b(SK-[A-Z0-9]+)\b/)?.[1];
      if (ref) booking.removeBooking(ref);
      if (typeof location !== "undefined" && location.pathname.startsWith("/bookings/")) navigate("/");
    },
  });

  return {
    form,
    error,
    termsError: error?.startsWith("Accept") ?? false,
    clearError: () => form.clearErrors("root"),
    // Details typed but not saved are saved first (an agent saves them explicitly).
    submit: form.handleSubmit((input) => {
      const details = document.querySelector<HTMLFormElement>(`#${TRAVELER_DETAILS_FORM}`);
      if (details) {
        const saved = detailsFrom(Object.fromEntries(new FormData(details)) as Record<string, string>, travelers);
        booking.saveDetails(saved.contact, saved.travelers);
      }
      try {
        book(input);
      } catch {
        // shown under the button
      }
    }),
  };
}
