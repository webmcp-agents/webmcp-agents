/**
 * `useWebTool({ … })`: the definition itself, no `defineWebTool` nesting, and nothing added to the JSX for the cursor.
 */
import { StrictMode, useState } from "react";
import { userEvent } from "vitest/browser";
import { afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { WebAgentsProvider } from "./provider";
import { countToolChanges, modelContext, resultText, sleep, toolNames, uniqueName, until } from "@webmcp-agents/testing";
import { useWebTool } from "./use-web-tool";

const QUIET = { linger: 50, yieldToUser: false } as const;

/** Which element the cursor is on when `execute` runs. */
const pressed = (): string | undefined => document.querySelector("[data-agent-active]")?.id;

function Counter({ id }: { id: string }) {
  const [count, setCount] = useState(0);
  const { registered } = useWebTool({ id, description: "Read the counter", readOnly: true, execute: () => `count is ${count}` });
  return (
    <button type="button" data-registered={registered} onClick={() => setCount((n) => n + 1)}>
      Increment
    </button>
  );
}

function Typed({ id }: { id: string }) {
  const add = useWebTool({
    id,
    description: "Add",
    inputSchema: z.object({ quantity: z.number() }),
    execute: ({ quantity }) => ({ added: quantity }),
  });
  expectTypeOf(add.invoke).parameter(0).toEqualTypeOf<{ quantity: number }>();
  expectTypeOf(add.invoke).returns.toEqualTypeOf<Promise<{ added: number }>>();
  return null;
}

/** Example 1 of the plan: the action is one function with two callers. */
function ClearCart({ id, onClear }: { id: string; onClear(): void }) {
  const [items, setItems] = useState(3);
  const clear = () => {
    onClear();
    setItems(0);
  };
  // An agent calls this.
  useWebTool({
    id,
    title: "Clear cart",
    description: "Empty the cart. The user confirms on the page.",
    destructive: true,
    requireConfirmation: true,
    execute: clear,
  });
  // A person clicks this. Nothing here is for the cursor.
  return (
    <>
      <button type="button" onClick={clear}>
        Clear cart
      </button>
      <output data-testid="items">{items} items</output>
    </>
  );
}

/** Example 4: one control per call, picked by the name a screen reader would say. */
function Cart({ id, onRemove }: { id: string; onRemove(entry: string): void }) {
  const [lines, setLines] = useState([
    { id: "l1", name: "Ocean Tee" },
    { id: "l2", name: "Field Mug" },
  ]);
  useWebTool({
    id,
    description: "Remove one line from the cart.",
    inputSchema: z.object({ lineId: z.string() }),
    // Which button? The one a screen reader calls "Remove Field Mug".
    target: ({ lineId }) => ({ role: "button", name: `Remove ${lines.find((line) => line.id === lineId)?.name}` }),
    execute: ({ lineId }) => {
      onRemove(`${lineId} at ${pressed()}`);
      setLines((all) => all.filter((line) => line.id !== lineId));
    },
  });
  return (
    <ul>
      {lines.map((line) => (
        <li key={line.id}>
          {line.name}
          <button type="button" id={`remove-${line.id}`} aria-label={`Remove ${line.name}`} />
        </li>
      ))}
      <li>
        <button type="button" onClick={() => setLines((all) => [...all, { id: "l3", name: "Trail Cap" }])}>
          Add a line
        </button>
      </li>
    </ul>
  );
}

/** Example 8: a "Try it" button invoking the component's own tool. */
function Product({ id, results }: { id: string; results: unknown[] }) {
  const [inCart, setInCart] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const add = ({ quantity }: { quantity: number }) => {
    setInCart((n) => n + quantity);
    return { added: quantity, at: pressed() };
  };
  const addToCart = useWebTool({
    id,
    title: "Add to cart",
    description: "Add this product to the cart.",
    inputSchema: z.object({ quantity: z.number().int().min(1) }),
    execute: add,
  });
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add({ quantity });
        }}
      >
        <label htmlFor="d-invoke-qty">Quantity</label>
        <input id="d-invoke-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.valueAsNumber)} />
        <button type="submit" id="d-invoke-add">
          Add to cart
        </button>
      </form>
      <button type="button" onClick={async () => results.push(await addToCart.invoke({ quantity: 2 }).catch((e: unknown) => e))}>
        Try it
      </button>
      <button type="button" onClick={async () => results.push(await addToCart.invoke({ quantity: 0 }).catch((e: unknown) => e))}>
        Try zero
      </button>
      <output data-testid="cart">
        {inCart} in cart, field shows {quantity}
      </output>
    </>
  );
}

describe("useWebTool(definition)", () => {
  beforeAll(() => modelContext());
  afterEach(() => sleep(20));

  it("registers once under StrictMode and always runs the latest render's execute", async () => {
    const id = uniqueName("d_count");
    const changes = countToolChanges();
    const screen = await render(
      <StrictMode>
        <Counter id={id} />
      </StrictMode>,
    );
    await sleep(20);
    expect(changes.count()).toBe(1);
    await screen.getByRole("button").click();
    await screen.getByRole("button").click();
    expect(resultText(await modelContext().executeTool(id, {}))).toBe("count is 2");
    expect(changes.count()).toBe(1); // new state never re-registers
    changes.stop();
    await expect.element(screen.getByRole("button")).toHaveAttribute("data-registered", "true");
    expect((await modelContext().getTools()).find((t) => t.name === id)?.annotations).toEqual({ readOnlyHint: true });
    await screen.unmount();
    await until(async () => !(await toolNames()).includes(id), 1500, "release after the answer grace");
  });

  it("infers invoke's types from the schema", async () => {
    const screen = await render(<Typed id={uniqueName("d_typed")} />);
    await screen.unmount();
  });

  it("a tool is one function with two callers: the cursor parks on the button named like it, and only the person's click runs it", async () => {
    const id = uniqueName("d_clear");
    const cleared = vi.fn();
    const screen = await render(
      <StrictMode>
        <WebAgentsProvider visuals={QUIET}>
          <ClearCart id={id} onClear={cleared} />
        </WebAgentsProvider>
      </StrictMode>,
    );
    let settled = false;
    const call = modelContext()
      .executeTool(id, {})
      .finally(() => {
        settled = true;
      });
    await until(() => !!document.querySelector(".agent-cursor.is-waiting"), 4000, "the cursor parked on the button");
    expect(document.querySelector(".agent-tag")?.textContent).toBe('Click "Clear cart" to confirm');
    expect(settled).toBe(false);
    expect(cleared).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Clear cart" }));
    await call;
    await expect.element(screen.getByTestId("items")).toHaveTextContent("0 items");
    expect(cleared).toHaveBeenCalledOnce(); // by the tool's execute: the click itself never reached onClick
    await screen.unmount();
  });

  it("a function target picks one row per call, from the latest render's state", async () => {
    const id = uniqueName("d_remove");
    const removed: string[] = [];
    const screen = await render(
      <WebAgentsProvider visuals={QUIET}>
        <Cart id={id} onRemove={(entry) => removed.push(entry)} />
      </WebAgentsProvider>,
    );
    await screen.getByRole("button", { name: "Add a line" }).click(); // state the tool was not registered with
    await modelContext().executeTool(id, { lineId: "l3" });
    await sleep(80);
    await modelContext().executeTool(id, { lineId: "l1" });
    expect(removed).toEqual(["l3 at remove-l3", "l1 at remove-l1"]);
    await until(() => !document.getElementById("remove-l1") && !document.getElementById("remove-l3"), 2000, "both rows gone");
    expect(document.getElementById("remove-l2")).not.toBeNull();
    await screen.unmount();
  });

  it("invoke() calls the tool as an agent would, from untouched JSX, and resolves to execute's return value", async () => {
    const id = uniqueName("d_invoke");
    const results: unknown[] = [];
    const screen = await render(
      <StrictMode>
        <WebAgentsProvider visuals={QUIET}>
          <Product id={id} results={results} />
        </WebAgentsProvider>
      </StrictMode>,
    );
    await sleep(20);
    (screen.getByRole("button", { name: "Try it" }).element() as HTMLButtonElement).click(); // a script's click: the cursor must not yield
    await until(() => results.length === 1, 4000, "invoke resolved");
    expect(results[0]).toEqual({ added: 2, at: "d-invoke-add" }); // the object itself; the cursor pressed the form's own button
    // the cursor typed 2 into the field labelled "Quantity": React state heard it
    await expect.element(screen.getByTestId("cart")).toHaveTextContent("2 in cart, field shows 2");

    (screen.getByRole("button", { name: "Try zero" }).element() as HTMLButtonElement).click();
    await until(() => results.length === 2, 4000, "invoke rejected");
    expect(results[1]).toMatchObject({ name: "WebToolError", code: "invalid_input" });
    await expect.element(screen.getByTestId("cart")).toHaveTextContent("2 in cart, field shows 2"); // invalid input never reached the page
    await screen.unmount();
  });
});
