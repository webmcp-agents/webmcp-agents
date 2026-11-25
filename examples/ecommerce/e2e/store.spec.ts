import { expect, test } from "@playwright/test";
import { listTools, openApp, parkedOn, runTool } from "@webmcp-agents/testing/playwright";
// `window.agent`'s type: the devtools the provider installs in development declare it
import type {} from "@webmcp-agents/react";

test.beforeEach(async ({ page }) => {
  // A clean cart once per test; later page loads in the same test keep it (it's in sessionStorage).
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    sessionStorage.removeItem("field-store:cart");
  });
});

test("tools by scope: global and page tools on the home page, no drawer or product tools", async ({ page }) => {
  await openApp(page, "/");
  await expect
    .poll(() => listTools(page))
    .toEqual(
      expect.arrayContaining([
        "search_products",
        "open_product",
        "browse_category",
        "go_to_page",
        "get_cart",
        "open_cart",
        "subscribe_newsletter",
      ]),
    );
  const names = await listTools(page);
  expect(names).not.toContain("update_cart_item");
  expect(names).not.toContain("add_to_cart");
  expect(names).not.toContain("checkout");
});

test("open_product → add_to_cart opens the drawer and its tools", async ({ page }) => {
  await openApp(page, "/");
  expect(await runTool(page, "open_product", { slug: "ocean-tee" })).toMatch(/^Opened Ocean Tee \(\$48\.00\)\. Size: S, M, L\./);
  await expect(page).toHaveURL(/\/product\/ocean-tee$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ocean Tee" })).toBeVisible();

  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  expect(await runTool(page, "add_to_cart", { variant: "M", qty: 2 })).toMatch(/^Added 2 × Ocean Tee \(M\) to the cart/);
  const drawer = page.getByRole("dialog", { name: /Your cart/ });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Quantity of Ocean Tee (M)")).toHaveValue("2");
  await expect.poll(() => listTools(page)).toEqual(expect.arrayContaining(["update_cart_item", "remove_from_cart"]));

  expect(await runTool(page, "update_cart_item", { slug: "ocean-tee", qty: 3 })).toMatch(/quantity is now 3/);
  await expect(drawer.getByLabel("Quantity of Ocean Tee (M)")).toHaveValue("3");

  // drawer tools go away with the drawer
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect.poll(() => listTools(page)).not.toContain("update_cart_item");
});

test("add_to_cart without a size asks the person on the page, then adds what they pick", async ({ page }) => {
  await openApp(page, "/product/linen-shirt");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  const pending = runTool(page, "add_to_cart", { qty: 2 });
  const prompt = page.getByRole("status").filter({ hasText: "Choose a size to add 2 × Linen Shirt." });
  await expect(prompt).toBeVisible();
  await expect(page.getByLabel("Size")).toBeFocused();
  await page.getByLabel("Size").selectOption("L");
  expect(await pending).toMatch(/^Added 2 × Linen Shirt \(L\) to the cart\..* The user chose size L\.$/);
  await expect(page.getByRole("dialog", { name: /Your cart/ })).toBeVisible();
});

test("add_to_cart without a size: 'Not now' tells the agent to ask", async ({ page }) => {
  await openApp(page, "/product/linen-shirt");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  const pending = runTool(page, "add_to_cart", { qty: 1 });
  await page.getByRole("button", { name: "Not now" }).click();
  expect(await pending).toBe("Error [needs_user]: The user didn't choose a size. Ask them which one they want: S, M, L, XL.");
});

test("add_to_cart with a bad quantity: the agent and the page get the same error", async ({ page }) => {
  await openApp(page, "/product/nesting-bowls");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  expect(await runTool(page, "add_to_cart", { qty: 9 })).toBe("Error [invalid_input]: Quantity must be a whole number from 1 to 3, got 9.");
  await expect(page.getByRole("alert")).toHaveText("Quantity must be a whole number from 1 to 3, got 9.");
});

test("close_cart closes the drawer; a tool for the page closes it first", async ({ page }) => {
  await openApp(page, "/product/stoneware-mug");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 1 });
  const drawer = page.getByRole("dialog", { name: /Your cart/ });
  await expect(drawer).toBeVisible();
  await expect.poll(() => listTools(page)).toContain("close_cart");
  expect(await runTool(page, "close_cart")).toBe("Closed the cart.");
  await expect(drawer).toBeHidden();
  await expect.poll(() => listTools(page)).not.toContain("close_cart");

  // drawer open again, then a tool about the page: the drawer gets out of the way
  await runTool(page, "open_cart");
  await expect(drawer).toBeVisible();
  expect(await runTool(page, "browse_category", { category: "home" })).toMatch(/^Opened Home:/);
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(/\/category\/home$/);
});

test("open_product with a slug that matches nothing answers an error and stays put", async ({ page }) => {
  await openApp(page, "/");
  expect(await runTool(page, "open_product", { slug: "nope" })).toMatch(/^Error \[invalid_input\]: No product matches "nope"/);
  await expect(page).toHaveURL(/\/$/);
});

test("go_to_page goes home and to all products", async ({ page }) => {
  await openApp(page, "/product/ocean-tee");
  expect(await runTool(page, "go_to_page", { page: "home" })).toBe("Opened the home page.");
  await expect(page).toHaveURL(/:\d+\/$/);
  expect(await runTool(page, "go_to_page", { page: "all-products" })).toMatch(/^Opened all products \(\d+\)\./);
  await expect(page).toHaveURL(/\/products$/);
});

test("go_to_page checkout needs something in the cart, then opens checkout and its tools", async ({ page }) => {
  await openApp(page, "/");
  expect(await runTool(page, "go_to_page", { page: "checkout" })).toMatch(/^Error \[failed\]: The cart is empty: add something first/);
  await expect(page).toHaveURL(/:\d+\/$/);
  await runTool(page, "open_product", { slug: "stoneware-mug" });
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 1 });
  expect(await runTool(page, "go_to_page", { page: "checkout" })).toMatch(/^Opened checkout\. Next: checkout/);
  await expect(page).toHaveURL(/\/checkout$/);
  await expect.poll(() => listTools(page)).toEqual(expect.arrayContaining(["checkout", "apply_promo"]));
});

test("open_product with a guessed slug opens the best match", async ({ page }) => {
  await openApp(page, "/");
  expect(await runTool(page, "open_product", { slug: "tee" })).toMatch(/^Opened Ocean Tee \(\$48\.00\)\./);
  await expect(page).toHaveURL(/\/product\/ocean-tee$/);
});

test("search_products lists matches and shows the results page", async ({ page }) => {
  await openApp(page, "/");
  expect(await runTool(page, "search_products", { query: "linen" })).toMatch(/^2 results for "linen":\n- Linen Shirt \[linen-shirt\]/);
  await expect(page).toHaveURL(/\/products\?q=linen$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for “linen”");
});

test("apply_promo: a bad code shows the error, WELCOME10 updates the totals", async ({ page }) => {
  await openApp(page, "/product/stoneware-mug");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 2 });
  await page.keyboard.press("Escape");
  await page.goto("/checkout");
  await page.waitForFunction(() => !!window.agent);
  await expect.poll(() => listTools(page)).toContain("apply_promo");

  expect(await runTool(page, "apply_promo", { code: "NOPE" })).toBe('Error [invalid_input]: Promo code "NOPE" is not valid.');
  await expect(page.getByRole("alert")).toHaveText('Promo code "NOPE" is not valid.');

  expect(await runTool(page, "apply_promo", { code: "WELCOME10" })).toMatch(/^Promo WELCOME10 applied: 10% off\. New total \$51\.20/);
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await expect(summary.getByText("Promo WELCOME10")).toBeVisible();
  await expect(summary.getByRole("button", { name: "Remove promo WELCOME10" })).toBeVisible();
});

test("checkout waits for the person's click (confirm gate)", async ({ page }) => {
  await openApp(page, "/product/canvas-tote");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 1 });
  await page.keyboard.press("Escape");
  await page.goto("/checkout");
  await page.waitForFunction(() => !!window.agent);
  await expect.poll(() => listTools(page)).toContain("checkout");

  const contact = {
    email: "mustafa@mail.test",
    name: "Mustafa Elsayed",
    address: "King Fahd Road 2411, Al Olaya",
    city: "Riyadh",
    postcode: "12214",
    country: "Saudi Arabia",
  };
  const pending = runTool(page, "checkout", contact);
  const placeOrder = page.getByRole("button", { name: /^Place order/ });
  await parkedOn(page, placeOrder);
  // the agent's values are in the form while it waits (typed, and the country picked)
  await expect(page.getByLabel("Email")).toHaveValue("mustafa@mail.test");
  await expect(page.getByLabel("Country")).toHaveValue("Saudi Arabia");
  // still waiting for the person
  const early = await Promise.race([pending.then(() => "settled"), page.waitForTimeout(500).then(() => "pending")]);
  expect(early).toBe("pending");

  await placeOrder.click();
  expect(await pending).toMatch(/^Order FS-[A-Z0-9]{4} placed for \$46\.00\./);
  await expect(page).toHaveURL(/\/order\/FS-[A-Z0-9]{4}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Order FS-[A-Z0-9]{4} confirmed$/);
});

test("leaving checkout while it waits for the click ends the call and the parked cursor", async ({ page }) => {
  await openApp(page, "/product/canvas-tote");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 1 });
  await page.keyboard.press("Escape");
  await page.goto("/checkout");
  await page.waitForFunction(() => !!window.agent);
  await expect.poll(() => listTools(page)).toContain("checkout");

  const contact = {
    email: "mustafa@mail.test",
    name: "Mustafa Elsayed",
    address: "King Fahd Road 2411, Al Olaya",
    city: "Riyadh",
    postcode: "12214",
    country: "Saudi Arabia",
  };
  const pending = runTool(page, "checkout", contact);
  await parkedOn(page, page.getByRole("button", { name: /^Place order/ }));

  await page.getByRole("link", { name: "Field Store" }).click(); // the person navigates away instead
  // The click is elsewhere (`cancelled`) and the page it leaves has no Place order (`unavailable`): whichever the gate
  // sees first answers, depending on how fast the route renders. Either way the call ends.
  expect(await pending).toMatch(
    /^Error \[(cancelled|unavailable)\]: "checkout" (was waiting for the user's confirmation; the user clicked elsewhere|needs the user's confirmation, but there is nothing to confirm on)/,
  );
  await expect(page.locator(".agent-cursor.is-waiting, .agent-ring.is-waiting")).toHaveCount(0);
});

test("an imperative tool types into the page: search_products writes its query into the header's search field", async ({ page }) => {
  await openApp(page, "/");
  expect(await runTool(page, "search_products", { query: "mug" })).toMatch(/^\d+ results? for "mug":/);
  await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue("mug");
  await expect(page).toHaveURL(/\/products\?q=mug$/);
});

test("a tool's control is found by the call: remove_from_cart presses that line's Remove button", async ({ page }) => {
  await openApp(page, "/product/stoneware-mug");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 1 });
  await runTool(page, "open_product", { slug: "canvas-tote" });
  // the mug page's add_to_cart is still registered for a moment after the route swap: wait for the tote's page
  await expect(page.getByRole("heading", { level: 1, name: "Canvas Tote" })).toBeVisible();
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 2 });
  const drawer = page.getByRole("dialog", { name: /Your cart/ });
  await expect(drawer).toBeVisible();
  await expect.poll(() => listTools(page)).toContain("remove_from_cart");
  expect(await runTool(page, "remove_from_cart", { slug: "stoneware-mug" })).toMatch(/^Removed Stoneware Mug\. 1 line left\./);
  await expect(drawer.getByRole("button", { name: /^Remove Stoneware Mug/ })).toHaveCount(0);
  await expect(drawer.getByLabel(/^Quantity of Canvas Tote/)).toHaveValue("2");
});

test("subscribe_newsletter types the email, ticks consent and waits for the person's click", async ({ page }) => {
  await openApp(page, "/");
  await expect.poll(() => listTools(page)).toContain("subscribe_newsletter");
  const pending = runTool(page, "subscribe_newsletter", { email: "mustafa@mail.test", consent: true });
  const subscribe = page.getByRole("button", { name: "Subscribe" });
  await parkedOn(page, subscribe);
  await expect(page.getByPlaceholder("you@example.com")).toHaveValue("mustafa@mail.test");
  await expect(page.getByRole("checkbox", { name: /one email a month/ })).toBeChecked();
  await subscribe.click();
  expect(await pending).toBe("Subscribed mustafa@mail.test to the Field Store newsletter.");
  await expect(page.getByRole("status").filter({ hasText: "subscribed as" })).toHaveText("You're subscribed as mustafa@mail.test.");
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the agent cursor shows while a tool runs", async ({ page }) => {
    await openApp(page, "/");
    const done = runTool(page, "open_cart");
    await expect(page.locator(".agent-cursor.is-visible")).toBeVisible();
    expect(await done).toMatch(/^Opened the cart\./);
    await expect(page.getByRole("dialog", { name: /Your cart/ })).toBeVisible();
  });

  test("the person using the page hides the cursor (moving the mouse alone does not); the tool still completes", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "a phone has no mouse to move");
    await openApp(page, "/product/ocean-tee");
    await expect.poll(() => listTools(page)).toContain("add_to_cart");
    const done = runTool(page, "add_to_cart", { variant: "L", qty: 3 });
    await expect(page.locator(".agent-cursor.is-visible")).toBeVisible();
    await page.mouse.move(200, 300);
    await page.mouse.move(600, 500, { steps: 10 });
    await expect(page.locator(".agent-cursor.is-visible")).toBeVisible();
    await page.mouse.wheel(0, 40);
    await expect(page.locator(".agent-cursor.is-visible")).toHaveCount(0);
    expect(await done).toMatch(/^Added 3 × Ocean Tee \(L\) to the cart/);
    await expect(page.getByRole("dialog", { name: /Your cart/ }).getByLabel("Quantity of Ocean Tee (L)")).toHaveValue("3");
  });
});
