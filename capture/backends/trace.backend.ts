/**
 * One agent turn in Field Store on Next.js, then its trace in the backend run.mjs started (CAPTURE_BACKEND). The chat
 * asks about the cart; the scripted model calls `get_cart`, the page runs it, and the model answers: one trace with the
 * page's `invoke_agent` run and `execute_tool` call and the server's two `chat` steps.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const APP = "http://localhost:5186";
const SERVICE = "field-store-nextjs";
const OUT = join(import.meta.dirname, "..", "out", "backends");
const backend = process.env.CAPTURE_BACKEND ?? "";

/** Poll until `find` returns a value, or fail after `ms`. */
async function until<T>(find: () => Promise<T | undefined>, ms: number, what: string): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await find().catch(() => undefined);
    if (value !== undefined) return value;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The names of a trace's spans, as a backend lists them. */
const complete = (names: string[]) =>
  names.some((n) => n.startsWith("invoke_agent")) &&
  names.some((n) => n.startsWith("execute_tool")) &&
  names.filter((n) => n.startsWith("chat")).length >= 2;

/** Each backend: wait for the trace, then show it. */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  // Jaeger 2 answers only its v3 API: OTLP JSON, spans grouped here by trace id
  async jaeger(page) {
    const id = await until(
      async () => {
        const min = new Date(Date.now() - 3_600_000).toISOString();
        const max = new Date(Date.now() + 60_000).toISOString();
        const res = await fetch(
          `http://localhost:16686/api/v3/traces?query.service_name=${SERVICE}&query.start_time_min=${min}&query.start_time_max=${max}`,
        );
        if (!res.ok) return undefined;
        const { result } = (await res.json()) as {
          result: { resourceSpans: { scopeSpans: { spans: { traceId: string; name: string }[] }[] }[] };
        };
        const traces = new Map<string, string[]>();
        for (const rs of result.resourceSpans)
          for (const ss of rs.scopeSpans)
            for (const span of ss.spans) traces.set(span.traceId, [...(traces.get(span.traceId) ?? []), span.name]);
        return [...traces].find(([, names]) => complete(names))?.[0];
      },
      90_000,
      "the trace in Jaeger",
    );
    await page.goto(`http://localhost:16686/trace/${id}`);
    // open the first model step: Jaeger's GenAI tab shows its model, provider and tokens
    await page
      .getByText(/^chat claude/)
      .first()
      .click();
    await page.getByText("Tokens:").first().waitFor();
  },
  // Phoenix files spans under a project ("default" without OpenInference's project attribute); its REST API lists them
  async phoenix(page) {
    const PHOENIX = "http://localhost:6006";
    const trace = await until(
      async () => {
        const res = await fetch(`${PHOENIX}/v1/projects/default/spans?limit=100`);
        if (!res.ok) return undefined;
        const { data } = (await res.json()) as { data: { name: string; context: { trace_id: string } }[] };
        const traces = new Map<string, string[]>();
        for (const span of data) traces.set(span.context.trace_id, [...(traces.get(span.context.trace_id) ?? []), span.name]);
        return [...traces].find(([, names]) => complete(names))?.[0];
      },
      90_000,
      "the trace in Phoenix",
    );
    const { data: projects } = (await (await fetch(`${PHOENIX}/v1/projects`)).json()) as {
      data: { id: string; name: string }[];
    };
    const project = projects.find((p) => p.name === "default")!.id;
    await page.goto(`${PHOENIX}/projects/${project}/spans/${trace}`);
    // the run is selected: its tree on the left, its attributes on the right
    await page.getByText("webmcp.conversation.id").first().waitFor();
  },
  // Grafana LGTM: Tempo behind Grafana's datasource proxy (anonymous access), the trace in Explore
  async lgtm(page) {
    const TEMPO = "http://localhost:3000/api/datasources/proxy/uid/tempo";
    const id = await until(
      async () => {
        const now = Math.floor(Date.now() / 1000);
        const res = await fetch(`${TEMPO}/api/search?start=${now - 3600}&end=${now + 60}&limit=20`);
        if (!res.ok) return undefined;
        const { traces } = (await res.json()) as { traces: { traceID: string; rootServiceName: string }[] };
        for (const t of traces.filter((x) => x.rootServiceName === SERVICE)) {
          const body = await (await fetch(`${TEMPO}/api/traces/${t.traceID}`)).text();
          const names = [...body.matchAll(/"name":"((?:invoke_agent|execute_tool|chat)[^"]*)"/g)].map((m) => m[1]!);
          if (complete(names)) return t.traceID;
        }
        return undefined;
      },
      120_000,
      "the trace in Tempo",
    );
    const panes = {
      a: {
        datasource: "tempo",
        queries: [{ refId: "A", datasource: { type: "tempo", uid: "tempo" }, queryType: "traceql", query: id }],
        range: { from: "now-1h", to: "now" },
      },
    };
    await page.goto(`http://localhost:3000/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify(panes))}`);
    await page.getByText("Service & Operation").waitFor();
    // give the trace the screen: fold the query editor, the outline and the menu
    for (const name of ["Collapse query row", "Collapse outline", "Close menu"])
      await page
        .getByRole("button", { name, exact: true })
        .click({ timeout: 5000 })
        .catch(() => {});
  },
};

test(`trace in ${backend}`, async ({ page }) => {
  const view = VIEWS[backend];
  test.skip(!view, `no view for "${backend}": run it through run.mjs`);

  // ---------- 1. one agent turn ----------
  await page.goto(APP);
  await page.locator('[data-wa-part="launcher"]').click();
  const input = page.locator('[data-wa-part="input"]');
  await input.waitFor();
  await input.fill("What is in my cart?");
  await input.press("Enter");
  await expect(page.locator('[data-wa-part="toolCard"]').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("I checked your cart", { exact: false })).toBeVisible({ timeout: 60_000 });
  // the page sends a run's spans when the run ends; give the relay and the server's export a moment
  await page.waitForTimeout(3000);

  // ---------- 2. the trace in the backend ----------
  await view!(page);
  await page.waitForTimeout(1500);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, `${backend}.png`), animations: "disabled" });
});
