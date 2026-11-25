import { expect, test } from "@playwright/test";
import {
  confirm,
  listTools,
  openApp,
  parkedOn,
  runTool,
} from "@webmcp-agents/testing/playwright";

test.use({ reducedMotion: "reduce" });

test("books a flight after the person confirms", async ({ page }) => {
  await openApp(page, "/");
  expect(await listTools(page)).toContain("search_flights");

  const query = { from: "CAI", to: "LHR", date: "2026-12-20" };
  await runTool(page, "search_flights", query);
  await expect(page).toHaveURL(/\/results\?/);

  const booking = runTool(page, "book_flight", { id: "SK-204" });
  const button = page.getByRole("button", { name: "Confirm booking" });
  await parkedOn(page, button);
  await confirm(page, button);
  expect(await booking).toMatch(/booked/i);
});
