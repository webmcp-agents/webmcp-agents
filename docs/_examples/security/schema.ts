import { z } from "zod";

// 2. In the schema: `x-sensitive: true` (or `format: "password"`)
// marks a property wherever the tool's schema goes.
export const paymentInput = z.object({
  cardholder: z.string(),
  cardNumber: z.string().meta({ "x-sensitive": true }),
});
