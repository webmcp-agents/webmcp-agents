"use client";
/**
 * add_to_cart, on a product's page: one React Hook Form schema for the agent's call and the person's submit. The cursor
 * writes the quantity into the Quantity field, visits the Size select (a custom widget: nothing to type into), `fill`
 * puts the size in the form, then it presses "Add to cart" and `add` runs.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { errorText } from "@webmcp-agents/core";
import { useWebTool, WebToolError } from "@webmcp-agents/react";
import { type UseFormReturn, useForm } from "react-hook-form";
import { z } from "zod";
import { cart, MAX_QTY, snapshot } from "@/lib/cart-store";
import type { Product } from "@/lib/catalog";

const schema = z.object({
  variant: z.string().optional().describe("The size, one of the product's options (S, M, L). Required when it has sizes."),
  quantity: z.number().int().min(1).max(MAX_QTY).describe("How many to add, e.g. 2"),
});

/** The add-to-cart form's values. */
export type AddToCartInput = z.infer<typeof schema>;

/** What the add-to-cart form renders and submits. */
export interface AddToCart {
  form: UseFormReturn<AddToCartInput>;
  /** The product's sizes, or `undefined` when it has none (no Size field). */
  sizes: Product["variants"];
  /** The most the Quantity field allows: the stock, capped per order. */
  maxQty: number;
  /** For `form.handleSubmit`: a bad pick shows under the form instead of throwing. */
  submit(input: AddToCartInput): void;
}

/** Registers add_to_cart for `product` and returns the form both callers share. */
export function useAddToCart(product: Product): AddToCart {
  const sizes = product.variants;

  const form = useForm<AddToCartInput>({
    resolver: zodResolver(schema),
    defaultValues: { variant: undefined, quantity: 1 },
  });

  const add = ({ variant, quantity }: AddToCartInput) => {
    form.clearErrors("root");
    try {
      return cart.add(product.slug, quantity, variant ?? null);
    } catch (err) {
      form.setError("root", { message: errorText(err) });
      throw new WebToolError("invalid_input", errorText(err));
    }
  };

  // An agent calls this.
  useWebTool({
    id: "add_to_cart",
    title: "Add to cart",
    description: `Add ${product.name} to the cart. Only on this product's page (open_product first).${sizes ? ` Needs a ${sizes.name.toLowerCase()} (${sizes.options.join(", ")}): ask the user if they didn't say one.` : ""} Next: keep shopping, or go_to_page checkout.`,
    inputSchema: schema,
    // the Size select is a custom widget: put the agent's pick in the form
    fill: (values) => form.reset(values),
    execute: add,
    // chat restore: undo the quantity that was just added
    revert: ({ quantity, variant }) => {
      const option = variant ?? null;
      const line = snapshot().lines.find((l) => l.slug === product.slug && l.variant === option);
      if (!line) return;
      const next = line.qty - quantity;
      cart.setQty(product.slug, option, next <= 0 ? 0 : next);
    },
  });

  return {
    form,
    sizes,
    maxQty: Math.min(product.stock, MAX_QTY),
    submit: (input) => {
      try {
        add(input);
      } catch {
        // shown under the form
      }
    },
  };
}
