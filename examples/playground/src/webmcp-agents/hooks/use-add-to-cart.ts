/**
 * add_to_cart_<sku>: a tool with input is a form. One schema checks the agent's call and the person's submit (React
 * Hook Form's zod resolver); `add` is what both run. When an agent calls it, the cursor types the quantity into the
 * card's Qty field (the field named `qty`, nearest the button), presses the button, and `add` runs.
 *
 * Three cards each have an "Add to cart" button, so the tool's title names the product: the card's button carries the
 * same name (`aria-label`), and that is how the cursor finds the right one.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useWebTool } from "@webmcp-agents/react";
import type { FormEvent } from "react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { z } from "zod";
import type { Product } from "../../data/products";
import { cart } from "../../store/cart";

const schema = z.object({
  qty: z.number().int().min(1).max(20).describe("How many to add, 1–20, e.g. 2"),
});

/** What the add-to-cart form holds. */
export type AddToCartInput = z.infer<typeof schema>;

/**
 * Registers add_to_cart_<sku> for one product and returns the card's form: `form` (React Hook Form) and `submit`, the
 * form's `onSubmit`, which runs the same `add` the agent's call does.
 */
export function useAddToCart(product: Product): {
  form: UseFormReturn<AddToCartInput>;
  submit: (event?: FormEvent<HTMLFormElement>) => Promise<unknown>;
} {
  const form = useForm<AddToCartInput>({
    resolver: zodResolver(schema),
    defaultValues: { qty: 1 },
  });

  const add = ({ qty }: AddToCartInput) => cart.add(product.sku, qty);

  // An agent calls this.
  useWebTool({
    id: `add_to_cart_${product.sku}`,
    title: `Add to cart: ${product.name}`,
    description: `Add ${product.name} to the cart, with a quantity. Use when the user asks for this product. Next: place_order (apply_promo first for a code).`,
    inputSchema: schema,
    execute: add,
    // chat restore: undo the quantity that was just added
    revert: ({ qty }) => {
      const item = cart.state.items.find((i) => i.sku === product.sku);
      if (!item) return;
      cart.setQty(product.sku, item.qty - qty);
    },
  });

  return { form, submit: form.handleSubmit(add) };
}
