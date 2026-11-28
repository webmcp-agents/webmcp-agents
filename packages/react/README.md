# @webmcp-agents/react

React bindings for WebMCP tools. A tool is `execute` plus an optional `target`: `useWebTool` registers it while a
component is mounted, the provider says which app-wide tools an agent may see, and the agent cursor finds the control a
tool belongs to by role and accessible name. Nothing is added to your JSX, nothing needs an ordering rule, and
navigating or remounting causes no `toolchange` churn.

```sh
pnpm add @webmcp-agents/react @webmcp-agents/core
```

That is the whole install: the provider loads a WebMCP polyfill where the browser has none, and in development
installs the devtools panel (Alt+Shift+A, `window.agent`), wired to its cursor. `devtools={false}` turns the panel off,
`devtools={{ initialOpen: true }}` configures it; a production build has no devtools code (the `import()` sits behind
`process.env.NODE_ENV === "development"`, which your bundler replaces).

## A tool in a component

The action is one function with two callers. When an agent calls `clear_cart`, the cursor finds the button named
"Clear cart" (the tool's `title`), parks on it, and `clear` runs only after the person's own click.

```tsx
import { useWebTool } from "@webmcp-agents/react";

export function ClearCart() {
  const cart = useCart();

  const clear = () => cart.clear();

  // An agent calls this.
  useWebTool({
    id: "clear_cart",
    title: "Clear cart",
    description: "Empty the cart. The user confirms on the page.",
    destructive: true,
    requireConfirmation: true,
    execute: clear,
  });

  // A person clicks this.
  return (
    <Button variant="destructive" onClick={clear}>
      Clear cart
    </Button>
  );
}
```

`useWebTool(definition, { enabled })` takes the same definition as `defineWebTool` (or a tool you already defined) and
returns `{ invoke, registered, supported }`. Calls always reach the latest render's `execute`, `target`, `fields` and
`fill`; the tool re-registers only when what the agent sees changes (id, title, description, schema, flags,
confirmation).

- `invoke(input)` calls it the way an agent would: the cursor moves, fields are typed, confirmation applies. It resolves
  to what `execute` returned. Try it from a button: `<Button onClick={() => addToCart.invoke({ quantity: 2 })}>Try it</Button>`.
- `registered`: the tool is registered with WebMCP right now. `supported`: the page has `document.modelContext`
  (inside a provider in a browser without WebMCP, both turn true once the polyfill it loads is there).
- A control the cursor cannot find by the tool's `title` (or its id read as words) needs `target`: a locator
  (`{ role: "button", name: "Remove Ocean Tee" }`), a selector, or a function of the input returning either or an
  Element. Icon-only buttons need an `aria-label`; translated UIs return the translated name from a function `target`.

## A form is a tool with an `inputSchema`

The cursor types each value into the field with that name or label, presses the button, and `execute` runs at the press.
React Hook Form and TanStack Form inputs hear the typing like a user's. Invalid input never reaches the page: the agent
gets the schema's messages back.

```tsx
const schema = z.object({
  quantity: z.number().int().min(1),
});

type AddToCartInput = z.infer<typeof schema>;

export function AddToCart({ product }: { product: Product }) {
  const cart = useCart();

  const form = useForm<AddToCartInput>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 1 },
  });

  const add = ({ quantity }: AddToCartInput) => {
    cart.add(product.id, quantity);
    return `Added ${quantity} × ${product.name}.`;
  };

  // An agent calls this.
  useWebTool({
    id: "add_to_cart",
    title: "Add to cart",
    description:
      "Add this product to the cart. Use after open_product. " +
      "Next: open_cart or checkout.",
    inputSchema: schema,
    execute: add,
  });

  // A person submits this.
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(add)} className="flex items-end gap-2">
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  {...field}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Add to cart</Button>
      </form>
    </Form>
  );
}
```

A `Select` or a date picker is not a text field, so there is nothing to type. One optional line shows the agent's values in
the form before the person confirms: `fill: (values) => form.reset(values)`. Order of a call: check the input, the cursor
types what it can, `fill`, the cursor parks on the button, the person clicks, `execute`.

## The provider

App-wide tools go in one object (`defineWebTool`, with `match` to choose the pages each one is on) and the provider is the same
line in Vite, TanStack Start, Next.js and Astro, because the library follows the browser's URL itself:

```tsx
import { WebAgentsProvider } from "@webmcp-agents/react";
import "@webmcp-agents/core/cursor.css";

<WebAgentsProvider tools={tools}>
  <App />
</WebAgentsProvider>
```

```tsx
// Only some of them, decided by your own state.
<WebAgentsProvider
  tools={tools}
  availableTools={user ? [tools.getTime, tools.getCart, tools.listOrders] : [tools.getTime, tools.getCart]}
  visuals={{ spotlight: true }}
>
  <App />
</WebAgentsProvider>
```

`tools` is everything the app has: an object, so a tool cannot be listed twice (two tools with one id throw at startup,
naming both keys). `availableTools` is what an agent may use right now (tools by reference or by key; left out, all).
`visuals` is the agent cursor's options, or `false`. The provider is a thin wrapper over core's `createWebAgents`.

There is nothing to load before it. In a browser without WebMCP (Firefox, Safari, Chrome without the origin trial) the
provider loads a `document.modelContext` polyfill itself, a chunk of its own that browsers with WebMCP never download;
your app renders at once (on the server too), and its tools register once the polyfill is there. That includes
production, so every visitor gets the tools and the chat. `polyfill={false}` keeps to native WebMCP only.

A catalog tool's `match` (`"/orders"`, `["/cart", "/checkout"]`, `/^\/orders\/\d+$/`) says where it is on; without one it
is on everywhere. Three scopes: everywhere (catalog), per path (catalog with `match`), per component (`useWebTool`,
on while mounted). `usePathname()` is the browser's current pathname, following every client-side router.

`match` turns a tool on as soon as the URL changes, which can be before the new route has rendered, so a tool must not
assume its page's state is there yet.

## Hooks

| Hook | |
|---|---|
| `useWebTool(definition, { enabled })` | Register a tool while mounted; returns `{ invoke, registered, supported }`. |
| `usePathname()` | The browser's pathname, kept fresh without a router. |
| `useEnableTools(ids)` / `<EnableTools names>` | Turn catalog tools on while a component is mounted (array catalogs, see below). |
| `useEnabledTools()` | The catalog tool ids registered right now. |
| `useWebAgents()` | The nearest provider's registry and cursor controls. |
| `useAgentEvents(listener)` | Every agent event (start, fill, park, result, error, cancel, yield, resume) while mounted. |

## Earlier form

Still supported, no longer what the docs teach: an array `tools` whose tools are off until named in `global={[ids]}`,
`routes={{ "/orders": [ids] }}` or `useEnableTools`; `pathname` (a router's idea of the path, overriding the built-in
tracking, for `routes` and `match`); `context` (reaches every catalog tool's `execute` as `ctx.context`, typed by
augmenting `Register`); `toolname="<id>"` markers and CSS-selector `target`s; `annotations` (the flags `readOnly`,
`destructive`, `repeatable`, `external` and `safeResponse` are the same hints under plain names).

## Declarative forms

A `<form toolname tooldescription>` is a tool as soon as it is in the DOM, with its schema built from its fields by the
browser. The package types the attributes for JSX (`toolname`, `tooldescription`, `toolautosubmit`,
`toolparamdescription`), and `useToolAnswer()` keeps a form that hides itself after its own action rendered until the
agent has its answer. See the
[Declarative forms guide](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/more/declarative-forms.mdx).

## Writing tool descriptions

A model picks a tool, and the order of calls, from its description alone (`description` on a tool, `tooldescription` on
a form). Say, in one or two sentences each and in this order:

1. what it does and what it answers;
2. when to use it ("Use after open_product");
3. what it needs first, when another tool has to run before it or it only exists on some page;
4. what comes next ("Next: open_cart or checkout").

Parameters say where a value comes from, with an example: `.describe('The slug as search_products lists it, e.g.
"ocean-tee"')`, not "the product". Errors say how to fix the call:
`throw new WebToolError("invalid_input", 'No product "x". Try search_products.')`. Tell the agent to ask for what the
person did not give rather than invent it. Full guide:
[Writing tool descriptions](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/concepts/tool-descriptions.mdx).

## Docs

- [Installation](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/(get-started)/installation/index.mdx)
- [Define a tool](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/build/define-a-tool.mdx): how the cursor finds the control, `target`, what the agent reads
- [Tools with input](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/build/tools-with-input.mdx): React Hook Form, TanStack Form, `fill`
- [Tool lifecycle](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/concepts/tool-lifecycle.mdx): StrictMode, routes and calls in flight
- [API reference](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/react/README.md)
