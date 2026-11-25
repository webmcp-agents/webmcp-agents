import { expect, test } from "@playwright/test";
import { listTools, openApp, parkedOn, runTool } from "@webmcp-agents/testing/playwright";
// `window.agent`'s type: the devtools the provider installs in development declare it
import type {} from "@webmcp-agents/react";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    sessionStorage.removeItem("field-store:cart");
  });
});

test("the Arabic toggle switches the assistant to right-to-left Arabic, and back", async ({ page }) => {
  await openApp(page, "/");
  const chat = page.locator('div.wa-chat[data-wa-part="root"]');
  await expect(chat).toHaveAttribute("dir", "ltr");

  await page.getByRole("button", { name: "Switch the assistant to Arabic" }).click();
  await expect(chat).toHaveAttribute("dir", "rtl");
  await expect(chat).toHaveAttribute("lang", "ar");
  // an Arabic string from the catalog (the launcher's name), not the English one
  await expect(chat.getByRole("button", { name: /^فتح/ })).toBeVisible();
  await chat.getByRole("button", { name: /^فتح/ }).click();
  await expect(chat.getByText("المساعد").first()).toBeVisible();
  // the shop itself stays left-to-right
  await expect(page.locator("html")).not.toHaveAttribute("dir", "rtl");

  // on a phone the open panel covers the footer
  await chat.getByRole("button", { name: "إغلاق المساعد" }).click();
  await page.getByRole("button", { name: "Switch the assistant to English" }).click();
  await expect(chat).toHaveAttribute("dir", "ltr");
});

test("the chat is themed: the shop's accent reaches the chat", async ({ page }) => {
  await openApp(page, "/");
  const accent = await page
    .locator('div.wa-chat[data-wa-part="root"]')
    .evaluate((el) => getComputedStyle(el).getPropertyValue("--wa-chat-color-accent").trim());
  expect(accent).not.toBe("");
  expect(accent.toLowerCase()).toBe("#1f5f4a");
});

test("checkout's card number is typed for real but shown masked", async ({ page }) => {
  const CARD = "4242 4242 4242 4242";
  await openApp(page, "/product/canvas-tote");
  await expect.poll(() => listTools(page)).toContain("add_to_cart");
  await runTool(page, "add_to_cart", { qty: 1 });
  await page.keyboard.press("Escape");
  await page.goto("/checkout");
  await page.waitForFunction(() => !!window.agent);
  await expect.poll(() => listTools(page)).toContain("checkout");

  // open the devtools first: a click there is the person's, so do it before the agent's call
  await page.getByRole("button", { name: /^Open Web Agents devtools/ }).click();
  const devtools = page.getByRole("dialog", { name: "Web Agents devtools" });
  await expect(devtools).toBeVisible();

  const pending = runTool(page, "checkout", {
    email: "mustafa@mail.test",
    name: "Mustafa Elsayed",
    address: "King Fahd Road 2411, Al Olaya",
    city: "Riyadh",
    postcode: "12214",
    country: "Saudi Arabia",
    cardNumber: CARD,
  });
  const placeOrder = page.getByRole("button", { name: /^Place order/ });
  await parkedOn(page, placeOrder);
  // the form holds the real number
  await expect(page.getByLabel("Card number (optional)")).toHaveValue(CARD);

  // the devtools log shows the masked one
  await devtools.getByRole("tab", { name: /^Timeline/ }).click();
  await devtools.getByRole("list", { name: "Tool calls, newest first" }).getByRole("button").first().click();
  await expect(devtools.getByText("cardNumber =")).toBeVisible();
  await expect(devtools.getByText('cardNumber = "[REDACTED]"')).toBeVisible();
  expect(await devtools.innerText()).not.toContain("4242");

  await placeOrder.click();
  expect(await pending).toMatch(/^Order FS-[A-Z0-9]{4} placed for /);
  // the order keeps no card number
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain("4242");
});
