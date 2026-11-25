import { defineWebTool } from "@webmcp-agents/core";
import { z } from "zod";

export const fillTraveler = defineWebTool({
  id: "fill_traveler",
  description:
    "Fill in the traveler's name, passport and email on the " +
    "booking form. Answers the booking reference.",
  inputSchema: z.object({
    fullName: z.string().describe('As on the passport, e.g. "Sara".'),
    passport: z.string().describe('The number, e.g. "A1234567".'),
    email: z.email().describe("Where the ticket goes."),
  }),
  // 1. On the tool: masked in events, the devtools, the tool card,
  // logs and telemetry. The form field gets the real value.
  sensitive: { input: ["passport"], output: ["bookingReference"] },
  execute: async () => ({ bookingReference: "SKY-4821" }),
});
