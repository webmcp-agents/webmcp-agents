/**
 * A form is a tool with an `inputSchema`: the cursor types into the fields it finds, and the form library hears it
 * like any typing. No adapter, no ref, no attribute: React Hook Form and TanStack Form on shadcn-style components
 * (a native `<input>` inside a component, a label wired by id, and one custom `role="combobox"` select).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm as useTanStackForm } from "@tanstack/react-form";
import { type ComponentProps, createContext, type ReactNode, useContext, useId, useState } from "react";
import { Controller, type ControllerProps, type FieldPath, type FieldValues, FormProvider, useForm } from "react-hook-form";
import { userEvent } from "vitest/browser";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { WebAgentsProvider } from "./provider";
import { modelContext, resultText, sleep, uniqueName, until } from "@webmcp-agents/testing";
import { useAgentEvents } from "./use-agent-events";
import { useWebTool } from "./use-web-tool";

const QUIET = { linger: 50, yieldToUser: false } as const;

// ---------- shadcn-style components: what `npx shadcn add form input button label select` gives an app ----------

function Input(props: ComponentProps<"input">) {
  return <input data-slot="input" {...props} />;
}

function Button(props: ComponentProps<"button">) {
  return <button data-slot="button" type="button" {...props} />;
}

function Label(props: ComponentProps<"label">) {
  // biome-ignore lint/a11y/noLabelWithoutControl: the caller passes htmlFor
  return <label data-slot="label" {...props} />;
}

const FormItemContext = createContext("");

function FormItem({ children }: { children: ReactNode }) {
  return (
    <FormItemContext.Provider value={useId()}>
      <div data-slot="form-item">{children}</div>
    </FormItemContext.Provider>
  );
}

function FormLabel({ children }: { children: ReactNode }) {
  return <Label htmlFor={useContext(FormItemContext)}>{children}</Label>;
}

/** shadcn's FormControl is a Slot that hands the item's id to its child. */
function FormControl({ children }: { children: (id: string) => ReactNode }) {
  return <>{children(useContext(FormItemContext))}</>;
}

function FormField<V extends FieldValues, N extends FieldPath<V>>(props: ControllerProps<V, N>) {
  return <Controller {...props} />;
}

/** A custom select, as Radix or Base UI render one: a button with `role="combobox"` and a popup listbox. No native control. */
function Select({
  id,
  value,
  onValueChange,
  options,
}: {
  id?: string;
  value: string;
  onValueChange(value: string): void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" role="combobox" id={id} aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen((o) => !o)}>
        {value || "Select…"}
      </button>
      {open && (
        <div role="listbox" id={`${id}-list`}>
          {options.map((option) => (
            <div
              key={option}
              role="option"
              tabIndex={-1}
              aria-selected={option === value}
              onClick={() => {
                onValueChange(option);
                setOpen(false);
              }}
              onKeyDown={() => {}}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Fills({ onFill }: { onFill(field: string): void }) {
  useAgentEvents((e) => {
    if (e.type === "fill") onFill(e.field);
  });
  return null;
}

const inProvider = (children: ReactNode) => <WebAgentsProvider visuals={QUIET}>{children}</WebAgentsProvider>;

// ---------- the forms under test ----------

const rhfSchema = z.object({ quantity: z.number().int().min(1), note: z.string() });
type RhfInput = z.infer<typeof rhfSchema>;

/** Example 2 of the plan: same hook, plus `inputSchema`; `execute` is the function the form already submits to. */
function RhfAddToCart({ id, added }: { id: string; added: Array<{ input: RhfInput; formState: RhfInput }> }) {
  const form = useForm<RhfInput>({ resolver: zodResolver(rhfSchema), defaultValues: { quantity: 1, note: "" } });
  const add = (input: RhfInput) => {
    added.push({ input, formState: form.getValues() });
    return `Added ${input.quantity} × Ocean Tee.`;
  };
  // An agent calls this.
  useWebTool({ id, title: "Add to cart", description: "Add this product to the cart.", inputSchema: rhfSchema, execute: add });
  // A person submits this.
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(add)}>
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                {(itemId) => (
                  <Input id={itemId} type="number" min={1} {...field} onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                )}
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>{(itemId) => <Input id={itemId} {...field} />}</FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Add to cart</Button>
      </form>
      <output data-testid="rhf-state">{JSON.stringify(form.watch())}</output>
    </FormProvider>
  );
}

const checkoutSchema = z.object({ email: z.string(), shipping: z.enum(["Standard", "Express"]), giftWrap: z.boolean() });
type Checkout = z.infer<typeof checkoutSchema>;

/** Example 3: a bigger form with a widget the cursor cannot type into, and `fill`. */
function CheckoutForm({ id, placed, filled }: { id: string; placed: Checkout[]; filled: string[] }) {
  const form = useForm<Checkout>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { email: "", shipping: "Standard", giftWrap: false },
  });
  const placeOrder = (order: Checkout) => {
    placed.push(order);
    return "Order placed.";
  };
  useWebTool({
    id,
    title: "Place order",
    description: "Place the order. The user confirms on the page.",
    inputSchema: checkoutSchema,
    requireConfirmation: true,
    // Optional: put every value on screen first (the Select too).
    fill: (values) => form.reset(values),
    execute: placeOrder,
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(placeOrder)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>{(itemId) => <Input id={itemId} type="email" {...field} />}</FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shipping"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shipping</FormLabel>
              <FormControl>
                {(itemId) => <Select id={itemId} value={field.value} onValueChange={field.onChange} options={["Standard", "Express"]} />}
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="giftWrap"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gift wrap</FormLabel>
              <FormControl>
                {(itemId) => <input id={itemId} type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Place order</Button>
      </form>
      <output data-testid="checkout-state">{JSON.stringify(form.watch())}</output>
      <Fills onFill={(field) => filled.push(field)} />
    </FormProvider>
  );
}

const tsfSchema = z.object({ quantity: z.number().int().min(1), size: z.enum(["S", "M", "L"]), note: z.string() });
type TsfInput = z.infer<typeof tsfSchema>;

function TsfAddToCart({ id, added }: { id: string; added: Array<{ input: TsfInput; formState: TsfInput }> }) {
  const add = (input: TsfInput) => {
    added.push({ input, formState: form.state.values });
    return `Added ${input.quantity} × Ocean Tee (${input.size}).`;
  };
  const form = useTanStackForm({
    defaultValues: { quantity: 1, size: "M", note: "" } as TsfInput,
    onSubmit: ({ value }) => void add(value),
  });
  useWebTool({
    id,
    title: "Add to cart",
    description: "Add this product to the cart.",
    inputSchema: tsfSchema,
    // TanStack Form's own way to set a value the cursor cannot type: the custom Select.
    fill: ({ size }) => form.setFieldValue("size", size),
    execute: add,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="quantity">
        {(field) => (
          <FormItem>
            <FormLabel>Quantity</FormLabel>
            <FormControl>
              {(itemId) => (
                <Input
                  id={itemId}
                  name={field.name}
                  type="number"
                  min={1}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                />
              )}
            </FormControl>
          </FormItem>
        )}
      </form.Field>
      <form.Field name="size">
        {(field) => (
          <FormItem>
            <FormLabel>Size</FormLabel>
            <FormControl>
              {(itemId) => (
                <Select
                  id={itemId}
                  value={field.state.value}
                  onValueChange={(v) => field.handleChange(v as "S" | "M" | "L")}
                  options={["S", "M", "L"]}
                />
              )}
            </FormControl>
          </FormItem>
        )}
      </form.Field>
      <form.Field name="note">
        {(field) => (
          <FormItem>
            <FormLabel>Note</FormLabel>
            <FormControl>
              {(itemId) => (
                <Input
                  id={itemId}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormControl>
          </FormItem>
        )}
      </form.Field>
      <Button type="submit">Add to cart</Button>
      <form.Subscribe selector={(state) => state.values}>
        {(values) => <output data-testid="tsf-state">{JSON.stringify(values)}</output>}
      </form.Subscribe>
    </form>
  );
}

describe("forms are tools", () => {
  beforeAll(() => modelContext());
  afterEach(() => sleep(20));

  // ---------- React Hook Form ----------

  it("a React Hook Form form receives the cursor's typed values in its state and submits through execute", async () => {
    const id = uniqueName("f_rhf_add");
    const added: Array<{ input: RhfInput; formState: RhfInput }> = [];
    const screen = await render(inProvider(<RhfAddToCart id={id} added={added} />));
    const res = await modelContext().executeTool(id, { quantity: 2, note: "Gift" });
    expect(resultText(res)).toBe("Added 2 × Ocean Tee.");
    // execute got the agent's input, and by then the form's own state already held what the cursor typed
    expect(added).toEqual([{ input: { quantity: 2, note: "Gift" }, formState: { quantity: 2, note: "Gift" } }]);
    await expect.element(screen.getByTestId("rhf-state")).toHaveTextContent('{"quantity":2,"note":"Gift"}');
    await expect.element(screen.getByLabelText("Quantity")).toHaveValue(2);

    // the same function serves a person: they change the field and submit the form themselves
    await screen.getByLabelText("Quantity").fill("5");
    await screen.getByRole("button", { name: "Add to cart" }).click();
    await until(() => added.length === 2, 2000, "the person's submit");
    expect(added[1]?.input).toEqual({ quantity: 5, note: "Gift" });

    // invalid input never reaches the form
    const bad = await modelContext().executeTool(id, { quantity: 0, note: "x" });
    expect(resultText(bad)).toMatch(/^Error \[invalid_input\]: .*quantity/);
    await expect.element(screen.getByLabelText("Quantity")).toHaveValue(5);
    expect(added).toHaveLength(2);
    await screen.unmount();
  });

  it("`fill: (values) => form.reset(values)` shows what the cursor cannot type (a custom Select) before the person confirms", async () => {
    const id = uniqueName("f_rhf_checkout");
    const placed: Checkout[] = [];
    const filled: string[] = [];

    const screen = await render(inProvider(<CheckoutForm id={id} placed={placed} filled={filled} />));
    const order = { email: "ada@example.com", shipping: "Express", giftWrap: true } as const;
    const pending = modelContext().executeTool(id, order);
    await until(() => !!document.querySelector(".agent-cursor.is-waiting"), 6000, "the cursor parked on Place order");

    // Before the person confirms, every value is on screen: typed where it could be, set by `fill` where not.
    await expect.element(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    await expect.element(screen.getByRole("combobox", { name: "Shipping" })).toHaveTextContent("Express");
    await expect.element(screen.getByLabelText("Gift wrap")).toBeChecked();
    await expect.element(screen.getByTestId("checkout-state")).toHaveTextContent(JSON.stringify(order));
    expect(filled).toEqual(["email", "giftWrap"]); // the Select was visited, never written
    expect(placed).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Place order" }));
    expect(resultText(await pending)).toBe("Order placed.");
    expect(placed).toEqual([order]); // once: the confirming click never reached the form's own submit
    await screen.unmount();
  });

  // ---------- TanStack Form ----------

  it("a TanStack Form form receives the cursor's typed values in its state and submits through execute", async () => {
    const id = uniqueName("f_tsf_add");
    const added: Array<{ input: TsfInput; formState: TsfInput }> = [];
    const screen = await render(inProvider(<TsfAddToCart id={id} added={added} />));
    const input = { quantity: 3, size: "L", note: "For Ada" } as const;
    const res = await modelContext().executeTool(id, input);
    expect(resultText(res)).toBe("Added 3 × Ocean Tee (L).");
    expect(added).toEqual([{ input, formState: input }]); // TanStack Form's own state held every value before execute ran
    await expect.element(screen.getByTestId("tsf-state")).toHaveTextContent(JSON.stringify(input));
    await expect.element(screen.getByRole("combobox", { name: "Size" })).toHaveTextContent("L");

    // a person: change the field, submit the form
    await screen.getByLabelText("Quantity").fill("4");
    await screen.getByRole("button", { name: "Add to cart" }).click();
    await until(() => added.length === 2, 2000, "the person's submit");
    expect(added[1]?.input).toEqual({ quantity: 4, size: "L", note: "For Ada" });
    await screen.unmount();
  });
});
