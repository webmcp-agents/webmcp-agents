/**
 * The checkout form: contact, shipping address and "Place order · $…". The checkout tool and the order it places live
 * in `useCheckout`; each field is named like the tool's parameter, so the cursor types the agent's value into it.
 */
import { Button } from "@webmcp-agents/examples-ui/components/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@webmcp-agents/examples-ui/components/form";
import { Input } from "@webmcp-agents/examples-ui/components/input";
import { NativeSelect, NativeSelectOption } from "@webmcp-agents/examples-ui/components/native-select";
import { Textarea } from "@webmcp-agents/examples-ui/components/textarea";
import { LockIcon } from "lucide-react";
import type { ComponentProps } from "react";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { money } from "../lib/format";
import { type CheckoutInput, type CheckoutOptions, useCheckout } from "../webmcp-agents/hooks/use-checkout";

export interface CheckoutFormProps extends CheckoutOptions {
  /** Cents: shown on the Place order button. */
  total: number;
}

export function CheckoutForm({ total, onPlaced }: CheckoutFormProps) {
  const { form, countries, submit } = useCheckout({ onPlaced });

  return (
    <Form {...form}>
      {/* A person submits this. */}
      <form onSubmit={submit} className="flex flex-col gap-10">
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-5 font-serif text-2xl tracking-tight">Contact</legend>
          <TextField form={form} name="email" label="Email" type="email" autoComplete="email" />
          <TextField form={form} name="name" label="Full name" autoComplete="name" />
        </fieldset>

        <fieldset className="flex flex-col gap-5">
          <legend className="mb-5 font-serif text-2xl tracking-tight">Shipping address</legend>
          <TextField form={form} name="address" label="Address" autoComplete="street-address" />

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField form={form} name="city" label="City" autoComplete="address-level2" />
            <TextField form={form} name="postcode" label="Postcode" autoComplete="postal-code" />
          </div>

          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl>
                  <NativeSelect required autoComplete="country-name" className="w-full [&_select]:h-10" {...field}>
                    {countries.map((c) => (
                      <NativeSelectOption key={c} value={c}>
                        {c}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order note (optional)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} value={field.value ?? ""} />
                </FormControl>
              </FormItem>
            )}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-5">
          <legend className="mb-5 font-serif text-2xl tracking-tight">Payment</legend>
          <TextField
            form={form}
            name="cardNumber"
            label="Card number (optional)"
            autoComplete="cc-number"
            inputMode="numeric"
            placeholder="4242 4242 4242 4242"
            required={false}
          />
        </fieldset>

        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" className="h-12 w-full text-base">
            Place order · <span className="tabular-nums">{money(total)}</span>
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <LockIcon className="size-3" aria-hidden="true" />
            Demo store: no payment is taken and nothing ships.
          </p>
        </div>
      </form>
    </Form>
  );
}

interface TextFieldProps extends Omit<ComponentProps<"input">, "form" | "name"> {
  form: UseFormReturn<CheckoutInput>;
  /** The tool's parameter of the same name is typed into it. */
  name: FieldPath<CheckoutInput>;
  label: string;
}

/** One required text field of the form, labelled. */
function TextField({ form, name, label, ...input }: TextFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input required className="h-10" {...input} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
