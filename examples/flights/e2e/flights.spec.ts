import { expect, type Page, test } from "@playwright/test";
import { listTools, openApp, parkedOn, runTool } from "@webmcp-agents/testing/playwright";

const RESULTS_URL = /\/flights\/lhr\/dxb\/oneway\/economy\/1\/0\/0\/\d{4}-\d{2}-\d{2}$/;
const RESULTS_TOOLS = ["filter_results", "list_results", "select_flight", "sort_results"];

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const search = { from: "LHR", to: "DXB", date: inDays(7), trip: "oneway", cabin: "economy", adults: 1 };

test.beforeEach(async ({ page }) => {
  // No pretend latency, and no bookings left over from another test.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e")) return;
    sessionStorage.setItem("e2e", "1");
    localStorage.clear();
  });
});

async function searchFromHome(page: Page): Promise<string | undefined> {
  await openApp(page, "/?latency=0");
  await expect.poll(() => listTools(page)).toContain("search_flights");
  return runTool(page, "search_flights", search);
}

async function selectFirst(page: Page): Promise<void> {
  await searchFromHome(page);
  await expect(page).toHaveURL(RESULTS_URL);
  await expect.poll(() => listTools(page)).toContain("select_flight");
  const listing = await runTool(page, "list_results", { limit: 1 });
  const id = listing?.match(/\[id (F-[A-Z0-9]{3})\]/)?.[1];
  expect(id).toBeTruthy();
  expect(await runTool(page, "select_flight", { flightId: id })).toMatch(new RegExp(`^Selected .*\\[id ${id}\\]`));
  await expect(page).toHaveURL(/\/flights\/booking$/);
}

test("search_flights answers, then shows the results; results tools exist only there", async ({ page }) => {
  await openApp(page, "/?latency=0");
  await expect.poll(() => listTools(page)).toContain("search_flights");
  const names = await listTools(page);
  expect(names).toContain("get_booking");
  for (const t of RESULTS_TOOLS) expect(names).not.toContain(t);

  expect(await runTool(page, "search_flights", search)).toMatch(
    /^Found \d+ flights London \(LHR\) → Dubai \(DXB\) on .*Cheapest: .*\[id F-/,
  );
  await expect(page).toHaveURL(RESULTS_URL);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/London.*Dubai/);
  await expect.poll(() => listTools(page)).toEqual(expect.arrayContaining(RESULTS_TOOLS));
});

test("search_flights takes airports and dates the way agents copy them; a date it can't read says how to send it", async ({ page }) => {
  await openApp(page, "/?latency=0");
  await expect.poll(() => listTools(page)).toContain("search_flights");
  expect(await runTool(page, "search_flights", { ...search, date: "next Friday" })).toBe(
    'Error [invalid_input]: Departure date must be YYYY-MM-DD, got "next Friday".',
  );
  const answer = await runTool(page, "search_flights", { ...search, from: "LHR.", to: "Dubai", date: `Fri ${search.date}.` });
  expect(answer).toMatch(/^Found \d+ flights London \(LHR\) → Dubai \(DXB\)/);
  await expect(page).toHaveURL(RESULTS_URL);
});

test("search_flights errors reach the agent and the page", async ({ page }) => {
  await openApp(page, "/?latency=0");
  await expect.poll(() => listTools(page)).toContain("search_flights");
  expect(await runTool(page, "search_flights", { ...search, trip: "roundtrip" })).toBe(
    "Error [invalid_input]: A round trip needs a returnDate (YYYY-MM-DD).",
  );
  await expect(page.getByRole("alert")).toHaveText("A round trip needs a returnDate (YYYY-MM-DD).");
  await expect(page).toHaveURL(/\/\?latency=0$/);
});

test("filter_results and sort_results change what the page shows", async ({ page }) => {
  await searchFromHome(page);
  await expect(page).toHaveURL(RESULTS_URL);
  await expect.poll(() => listTools(page)).toContain("filter_results");

  expect(await runTool(page, "filter_results", { stops: "0" })).toMatch(/^Showing \d+ of \d+ flights/);
  const cards = page.locator("[data-flight-id]");
  await expect(cards.first()).toBeVisible();
  const stops = await page
    .locator("[data-flight-id] [data-direct], [data-flight-id]")
    .evaluateAll((els) => els.filter((el) => el.matches("[data-flight-id]")).map((el) => el.textContent?.includes("Direct")));
  expect(stops.length).toBeGreaterThan(0);
  expect(stops.every(Boolean)).toBe(true);

  expect(await runTool(page, "sort_results", { by: "price-desc" })).toMatch(/^Sorted \d+ flights/);
  await expect(page.getByRole("button", { name: "Price: high to low" })).toHaveAttribute("aria-pressed", "true");
  const prices = await page.locator("[data-price]").evaluateAll((els) => els.map((el) => Number(el.getAttribute("data-price"))));
  expect(prices.length).toBeGreaterThan(0);
  expect(prices.every((p, i) => i === 0 || prices[i - 1]! >= p)).toBe(true);
});

test("filter_results by airline name ticks that airline's checkbox", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "the filters sit in a closed sheet on phones");
  await searchFromHome(page);
  await expect.poll(() => listTools(page)).toContain("filter_results");
  const name = (await page.locator("[data-flight-id]").first().getAttribute("aria-label"))!.split(/ [A-Z]{2} \d/)[0]!;
  expect(await runTool(page, "filter_results", { airlines: [name.toLowerCase()] })).toMatch(/^Showing \d+ of \d+ flights/);
  const box = page.getByRole("complementary", { name: "Filters" }).getByRole("checkbox", { name });
  await expect(box).toBeChecked();
  await box.uncheck();
  await expect(page.getByRole("radio", { name: "Any" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Clear filters" })).toBeHidden();
});

test("select_flight opens the booking page; results tools go away", async ({ page }) => {
  await selectFirst(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Book your flight");
  await expect.poll(() => listTools(page)).toEqual(expect.arrayContaining(["fill_traveler_details", "book_flight"]));
  await expect.poll(() => listTools(page)).not.toContain("filter_results");
});

test("book_flight: missing details is an error; then details → confirm gate → booked", async ({ page }) => {
  await selectFirst(page);
  await expect.poll(() => listTools(page)).toContain("book_flight");
  const book = page.getByRole("button", { name: /^Book flight · USD/ });

  // without details: the gate still waits for the person; the answer names the missing fields
  const early = runTool(page, "book_flight", { acceptTerms: true });
  await parkedOn(page, book);
  await expect(page.getByRole("checkbox", { name: /I accept the fare rules/ })).toBeChecked(); // ticked by the cursor
  await book.click();
  expect(await early).toMatch(/^Error \[failed\]: Missing traveler details: firstName, lastName, email, phone, firstName_1/);
  await expect(page.getByRole("alert")).toContainText("Missing traveler details");

  const details = {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "+44 20 7946 0000",
    firstName_1: "Ada",
    lastName_1: "Lovelace",
    dob_1: "1990-12-10",
    document_1: "X1234567",
  };
  expect(await runTool(page, "fill_traveler_details", details)).toBe(
    "Saved details for 1 traveler. Next: book_flight (needs the user's confirmation).",
  );

  const pending = runTool(page, "book_flight", { acceptTerms: true });
  await parkedOn(page, book);
  const state = await Promise.race([pending.then(() => "settled"), page.waitForTimeout(500).then(() => "pending")]);
  expect(state).toBe("pending");
  await book.click();
  const answer = await pending;
  const ref = answer?.match(/^Booked (SK-[A-Z0-9]{6})/)?.[1];
  expect(ref).toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`/bookings/${ref}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're booked");

  expect(await runTool(page, "get_booking", { reference: ref })).toMatch(
    new RegExp(`^Booking ${ref}: confirmed\\.\\nLondon \\(LHR\\) → Dubai \\(DXB\\)`),
  );
});

test("fill_traveler_details types into the TanStack Form fields; the person sees every value before booking", async ({ page }) => {
  await selectFirst(page);
  await expect.poll(() => listTools(page)).toContain("fill_traveler_details");
  const details = {
    firstName: "Mustafa",
    lastName: "Elsayed",
    email: "mustafa@mail.test",
    phone: "+966567891011",
    firstName_1: "Mustafa",
    lastName_1: "Elsayed",
    dob_1: "2000-01-01",
    document_1: "A12345678",
  };
  expect(await runTool(page, "fill_traveler_details", details)).toBe(
    "Saved details for 1 traveler. Next: book_flight (needs the user's confirmation).",
  );
  const contact = page.getByRole("region", { name: "Contact information" });
  await expect(contact.getByLabel("Email")).toHaveValue("mustafa@mail.test");
  await expect(contact.getByLabel("Phone")).toHaveValue("+966567891011");
  const traveler = page.getByRole("region", { name: /^Traveler 1/ });
  await expect(traveler.getByLabel("Date of birth")).toHaveValue("2000-01-01");
  await expect(traveler.getByLabel("Passport or ID number")).toHaveValue("A12345678");
  await expect(page.getByRole("status").filter({ hasText: "Saved details" })).toBeVisible();
});

test("filter_results ticks the stops radio it sets; the results tools follow the URL", async ({ page, isMobile }) => {
  test.skip(isMobile, "the filters sit in a closed sheet on phones");
  await searchFromHome(page);
  await expect.poll(() => listTools(page)).toContain("filter_results");
  expect(await runTool(page, "filter_results", { stops: "0" })).toMatch(/^Showing \d+ of \d+ flights/);
  await expect(page.getByRole("radio", { name: /^Direct/ })).toBeChecked();
  // back home, client-side: the tools whose `match` no longer fits turn off
  await page.goBack();
  await expect(page).toHaveURL(/\/\?latency=0$/);
  await expect.poll(() => listTools(page)).not.toContain("filter_results");
  await page.goForward();
  await expect.poll(() => listTools(page)).toEqual(expect.arrayContaining(RESULTS_TOOLS));
});

test("a malformed results URL shows a readable error page", async ({ page }) => {
  await page.goto(`/flights/xxx/dxb/oneway/economy/1/0/0/${inDays(7)}?latency=0`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("That search doesn't work");
  await expect(page.getByText('Unknown airport "XXX"')).toBeVisible();
});

test("reloading the booking page with nothing selected goes home", async ({ page }) => {
  await page.goto("/flights/booking?latency=0");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Book your next adventure");
});

test.describe("get_location", () => {
  test.use({ geolocation: { latitude: 51.5074, longitude: -0.1278, accuracy: 120 }, permissions: ["geolocation"] }); // central London

  test("answers the city, coordinates and nearest airport, from any page", async ({ page }) => {
    await page.route("https://api.bigdatacloud.net/**", (route) =>
      route.fulfill({ json: { city: "London", locality: "London", principalSubdivision: "England", countryName: "United Kingdom" } }),
    );
    await openApp(page, "/");
    expect(await listTools(page)).toContain("get_location");
    const answer = await runTool(page, "get_location");
    expect(answer).toMatch(
      /^The user is in London, England, United Kingdom at 51\.5074, -0\.1278 \(accurate to about 0\.1 km\)\. The nearest airport is London Heathrow \(LHR\), about \d+ km away\./,
    );
    expect(answer).toContain("Use from: LHR in search_flights.");
  });

  test("still answers coordinates and airports when the city lookup fails", async ({ page }) => {
    await page.route("https://api.bigdatacloud.net/**", (route) => route.abort());
    await openApp(page, "/");
    expect(await runTool(page, "get_location")).toMatch(/^The user is at 51\.5074, -0\.1278 .*London Heathrow \(LHR\)/);
  });
});

test.describe("get_location without the location", () => {
  test.use({ permissions: [], timezoneId: "Asia/Dubai" });

  test("falls back to the time zone when the location isn't shared", async ({ page, context }) => {
    await context.clearPermissions();
    await openApp(page, "/");
    // a blocked location reads as "not shared"
    await page.evaluate(() => {
      Object.defineProperty(navigator, "permissions", { value: { query: async () => ({ state: "denied" }) }, configurable: true });
    });
    expect(await runTool(page, "get_location")).toMatch(
      /no coordinates, but their time zone \(Asia\/Dubai\) suggests Dubai International \(DXB\)\. Confirm with the user/,
    );
  });
});

test.describe("get_time", () => {
  test.use({ timezoneId: "Asia/Riyadh", locale: "en-GB" });

  test("answers the user's date, time and what relative dates mean", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-08T11:05:00Z")); // 14:05 in Riyadh, a Sunday
    await openApp(page, "/");
    expect(await listTools(page)).toContain("get_time");
    const answer = await runTool(page, "get_time");
    expect(answer).toContain("Now: 14:05 on Sun 2026-11-08 for the user (Asia/Riyadh, UTC+03:00)");
    expect(answer).toContain("Tomorrow: 2026-11-09 (Mon)");
    expect(answer).toContain("Fri 2026-11-13");
    expect(answer).toMatch(/Next week: 2026-11-09 to 2026-11-15 \(weeks start on Monday for en-GB\)/);
  });
});
