import { expect, test } from "@playwright/test";
import { listTools, openApp, parkedOn, runTool } from "@webmcp-agents/testing/playwright";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    sessionStorage.removeItem("field-store-next:cart");
  });
});

test("the server-rendered home registers the global and page tools after hydration", async ({ page }) => {
  await openApp(page, "/");
  await expect(page.getByRole("heading", { level: 1, name: "Everything in the store" })).toBeVisible();
  await expect.poll(() => listTools(page)).toEqual(expect.arrayContaining(["search_products", "open_product", "go_to_page", "get_cart"]));
  expect(await listTools(page)).not.toContain("add_to_cart");
});

test("open_product → add_to_cart → checkout parks on Place order until a real click", async ({ page }) => {
  await openApp(page, "/");
  await expect.poll(() => listTools(page)).toContain("open_product"); // the provider registers after hydration
  expect(await runTool(page, "open_product", { slug: "ocean-tee" })).toMatch(/^Opened Ocean Tee \(\$48\.00\)\. Size: S, M, L\./);
  await expect(page).toHaveURL(/\/product\/ocean-tee$/);
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  expect(await runTool(page, "add_to_cart", { variant: "M", quantity: 2 })).toMatch(/^Added 2 × Ocean Tee \(M\)/);

  expect(await runTool(page, "go_to_page", { page: "checkout" })).toMatch(/^Opened checkout/);
  await expect.poll(() => listTools(page)).toEqual(expect.arrayContaining(["apply_promo", "checkout"]));
  expect(await runTool(page, "apply_promo", { code: "WELCOME10" })).toMatch(/^Applied WELCOME10/);

  const pending = runTool(page, "checkout", {
    email: "mustafa@mail.test",
    name: "Mustafa Elsayed",
    address: "King Fahd Road 2411, Al Olaya, Riyadh 12214",
    country: "United Arab Emirates",
  });
  const button = page.getByRole("button", { name: /^Place order/ });
  await parkedOn(page, button);
  // typed into the inputs, and the shadcn Select set by the tool's `fill` (it is not a field the cursor can type into)
  await expect(page.getByLabel("Email")).toHaveValue("mustafa@mail.test");
  await expect(page.getByRole("combobox", { name: "Country" })).toHaveText(/United Arab Emirates/);
  await button.click();
  expect(await pending).toMatch(/^Order FS-\w+ placed/);
  await expect(page).toHaveURL(/\/cart\?placed=/);
});

test("add_to_cart writes the quantity and its fill picks the size in the shadcn Select", async ({ page }) => {
  await openApp(page, "/product/ocean-tee");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  expect(await runTool(page, "add_to_cart", { variant: "L", quantity: 3 })).toMatch(/^Added 3 × Ocean Tee \(L\)/);
  await expect(page.getByLabel("Quantity")).toHaveValue("3");
  await expect(page.getByRole("combobox", { name: "Size" })).toHaveText(/L/);
  await expect(page.getByRole("link", { name: /^Cart \(3\)/ })).toBeVisible();
});

test("the API key never reaches the client", async ({ page }) => {
  await openApp(page, "/");
  const html = await page.content();
  expect(html).not.toMatch(/sk-ant-|ANTHROPIC_API_KEY=/);
  const status = await page.evaluate(() => fetch("/api/chat").then((r) => r.json()));
  expect(status).toMatchObject({ model: expect.any(String), agents: ["shopper", "checkout"] });
});
