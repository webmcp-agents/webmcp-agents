/**
 * A browser without WebMCP (Playwright's Chromium), as in Firefox or Safari: the provider loads the polyfill itself.
 * Nothing here installs it: this file runs in a project whose only setup is the kit's matchers. The tests share one
 * page and run in order.
 */
import { defineWebTool } from "@webmcp-agents/core";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server.browser";
import { sleep, until } from "@webmcp-agents/testing";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { WebAgentsProvider } from "./provider";
import { useWebTool } from "./use-web-tool";

/** Read without installing anything: this page has no WebMCP until the provider loads the polyfill. */
const names = async (): Promise<string[]> => ((await document.modelContext?.getTools()) ?? []).map((t) => t.name);

const catalog = { listed: defineWebTool({ id: "catalog_tool", description: "test tool", readOnly: true, execute: () => "ok" }) };

function Inline() {
  const { registered, supported } = useWebTool({ id: "inline_tool", description: "test tool", readOnly: true, execute: () => "ok" });
  return (
    <p data-testid="inline" data-registered={registered} data-supported={supported}>
      Inline
    </p>
  );
}

const app = (
  <StrictMode>
    <WebAgentsProvider tools={catalog}>
      <h1>Page</h1>
      <Inline />
    </WebAgentsProvider>
  </StrictMode>
);

describe("<WebAgentsProvider> without native WebMCP", () => {
  it("renders its children on the server: there is no gate", () => {
    expect(renderToString(app)).toContain("<h1>Page</h1>");
  });

  it("renders its children on first paint, before the polyfill has loaded, and registers their tools once it has", async () => {
    expect(document.modelContext).toBeUndefined();
    const screen = await render(app);
    expect(screen.container.querySelector("h1")?.textContent).toBe("Page");
    const inline = screen.getByTestId("inline");
    await expect.element(inline).toHaveAttribute("data-supported", "false");
    expect(document.modelContext).toBeUndefined(); // still loading: the tools wait

    await until(() => !!document.modelContext, "the polyfill");
    await until(async () => (await names()).includes("inline_tool"), "the waiting tools");
    expect(await names()).toEqual(expect.arrayContaining(["catalog_tool", "inline_tool"]));
    await expect.element(inline).toHaveAttribute("data-registered", "true");
    await expect.element(inline).toHaveAttribute("data-supported", "true");

    // StrictMode's mount → unmount → mount left one registration each, and unmounting releases them.
    screen.unmount();
    await until(async () => (await names()).length === 0, "the release");
  });

  it("with polyfill={false} renders, loads nothing and registers nothing when WebMCP is missing", async () => {
    // The page now has the polyfill from the test above: take it away again to stand for a browser without WebMCP.
    const polyfill = document.modelContext;
    delete (document as { modelContext?: ModelContext }).modelContext;
    try {
      const screen = await render(
        <WebAgentsProvider tools={catalog} polyfill={false}>
          <h1>Native only</h1>
        </WebAgentsProvider>,
      );
      expect(screen.container.querySelector("h1")?.textContent).toBe("Native only");
      await sleep(100);
      expect(document.modelContext).toBeUndefined();
      screen.unmount();
    } finally {
      Object.defineProperty(document, "modelContext", { value: polyfill, configurable: true });
    }
  });
});
