/**
 * add_to_cart, on a product's page: a form, so a tool with an input schema. One schema checks the agent's call and the
 * person's submit (React Hook Form's zod resolver), and `add` is what both run. When an agent calls it, the cursor
 * writes the size into the Size select and the quantity into the stepper (the fields named `variant` and `qty`),
 * presses "Add to cart", and `add` runs. On success the cart drawer opens. The Size select is shadcn's NativeSelect:
 * a native control the cursor writes like a person, so no `fill` is needed.
 *
 * One stable name on every product page: only one product is on screen, so the product is implied and the agent
 * picks the size and quantity. Adding is reversible, so there is nothing to confirm.
 *
 * An agent that leaves out the size isn't failed: the person is right here. The form highlights the size field and
 * waits for their pick (a page can't open a native dropdown without a real click), then adds and tells the agent what
 * was chosen. No pick within a minute answers the agent to ask instead (`Error [needs_user]`). `waitingForUser` tells
 * the agent's tool clock the person is being asked.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { errorText } from "@webmcp-agents/core";
import { useWebTool, WebToolError, waitingForUser } from "@webmcp-agents/react";
import { type BaseSyntheticEvent, useEffect, useState } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { z } from "zod";
import type { Product } from "../../data/catalog";
import { cart, cartSnapshot } from "../../store/cart";
import { MAX_QTY, resolveVariant } from "../../store/cart-rules";
import { ui } from "../../store/ui";

/** How long an agent's add waits for the person to pick the missing option. */
const ASK_TIMEOUT_MS = 60_000;

/** The input for one product: its sizes as an enum, when it has them. */
function schemaFor(product: Product) {
  const axis = product.variants;
  const max = Math.min(product.stock, MAX_QTY);
  return z.object({
    variant: axis
      ? z
          .enum(axis.options as [string, ...string[]])
          .optional()
          .describe(`${axis.name}: one of ${axis.options.join(", ")}. Required.`)
      : z.string().optional().describe("Leave out: this product has no options."),
    qty: z.number().int().min(1).max(MAX_QTY).describe(`How many to add, 1 to ${max}, e.g. 2`),
  });
}

export type AddToCartInput = z.infer<ReturnType<typeof schemaFor>>;

/** An agent's add waiting for the person to pick the option it left out. */
interface Asking {
  qty: number;
  settle(variant: string | null): void;
}

export interface AddToCart {
  form: UseFormReturn<AddToCartInput>;
  /** The product's one option axis ("Size" and its options), or undefined when it has none. */
  axis: Product["variants"];
  /** The most the stepper allows: stock, capped at MAX_QTY. */
  max: number;
  /** The last failure, the same text the agent got; shown under the form. */
  error: string | null;
  /** An agent left out the option and the person is being asked for it (how many it wants to add); null otherwise. */
  asking: { qty: number } | null;
  /** The person picked an option: answers a waiting agent, and clears the error. */
  pick(variant: string | undefined): void;
  /** The person declines to pick: the agent is told to ask them instead. */
  notNow(): void;
  /** The person changed a field: the last error goes. */
  clearError(): void;
  /** The form's onSubmit. */
  submit(e?: BaseSyntheticEvent): Promise<unknown>;
}

/** The product page's add-to-cart form: one `add` for the agent's call and the person's submit, and the add_to_cart tool. */
export function useAddToCart(product: Product): AddToCart {
  const axis = product.variants;
  const [schema] = useState(() => schemaFor(product));

  const form = useForm<AddToCartInput>({
    resolver: zodResolver(schema),
    defaultValues: { variant: undefined, qty: 1 },
  });

  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);

  /** The person picks the size an agent left out; null: they didn't (Not now, or no pick in time). */
  const ask = (qty: number): Promise<string | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => settle(null), ASK_TIMEOUT_MS);
      let done = false;
      function settle(picked: string | null): void {
        if (done) return; // a pick, "Not now" or the timeout: whichever comes first
        done = true;
        clearTimeout(timer);
        setAsking(null);
        resolve(picked);
      }
      setAsking({ qty, settle });
      waitingForUser("add_to_cart", `Choose a ${axis!.name.toLowerCase()} to add ${product.name}`);
    });

  /** Add, and the sentence for the agent; a failure shows the same text under the form. */
  const add = async ({ variant, qty }: AddToCartInput, asked = false): Promise<string> => {
    if (axis && !variant) {
      const picked = await ask(qty);
      if (picked === null)
        throw new WebToolError(
          "needs_user",
          `The user didn't choose a ${axis.name.toLowerCase()}. Ask them which one they want: ${axis.options.join(", ")}.`,
        );
      return add({ variant: picked, qty }, true);
    }

    try {
      const text = cart.add(product.slug, qty, variant ?? null);
      setError(null);
      ui.openCart(); // the drawer shows the line, and turns on its own tools
      return asked ? `${text} The user chose ${axis!.name.toLowerCase()} ${variant}.` : text;
    } catch (err) {
      setError(errorText(err));
      throw new WebToolError("invalid_input", errorText(err));
    }
  };

  // Asking: put the person on the size field.
  useEffect(() => {
    if (asking) form.setFocus("variant");
  }, [asking, form]);

  // An agent calls this.
  useWebTool({
    id: "add_to_cart",
    title: "Add to cart",
    description: `Add ${product.name} to the cart. Only on this product's page (open_product first).${axis ? ` Needs a ${axis.name.toLowerCase()} (${axis.options.join(", ")}): ask the user if they didn't say one.` : ""} The cart opens after. Next: keep shopping, or go_to_page checkout.`,
    inputSchema: schema,
    execute: (input) => add(input),
    // chat restore: undo the quantity that was just added
    revert: ({ qty, variant }) => {
      let option: string | null;
      try {
        option = resolveVariant(product, variant);
      } catch {
        return;
      }
      const line = cartSnapshot().lines.find((l) => l.slug === product.slug && l.variant === option);
      if (!line) return;
      const next = line.qty - qty;
      if (next <= 0) cart.remove(product.slug, option);
      else cart.setQty(product.slug, option, next);
    },
  });

  return {
    form,
    axis,
    max: Math.min(product.stock, MAX_QTY),
    error,
    asking: asking && { qty: asking.qty },
    pick: (variant) => {
      setError(null);
      if (asking && variant) asking.settle(variant);
    },
    notNow: () => asking?.settle(null),
    clearError: () => setError(null),
    // a failure is already under the form
    submit: form.handleSubmit((input) => add(input).catch(() => {})),
  };
}
