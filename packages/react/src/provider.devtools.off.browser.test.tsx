/**
 * Outside development (NODE_ENV is "test" here, "production" in a production build, where bundlers also drop the
 * import): the provider never loads the devtools, whatever `devtools` says. The development half is
 * provider.devtools.browser.test.tsx, run with NODE_ENV "development" (vitest.config.ts).
 */
import { StrictMode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { WebAgentsProvider } from "./provider";
import { modelContext, sleep } from "@webmcp-agents/testing";

describe("<WebAgentsProvider devtools> outside development", () => {
  beforeAll(() => modelContext());

  it("installs no panel and no window.agent, by default or when asked", async () => {
    const screen = await render(
      <StrictMode>
        <WebAgentsProvider visuals={false} />
        <WebAgentsProvider visuals={false} devtools={{ initialOpen: true }} />
      </StrictMode>,
    );
    await sleep(500);
    expect(document.querySelectorAll('[data-web-agents-ui="devtools"]')).toHaveLength(0);
    expect(window.agent).toBeUndefined();
    await screen.unmount();
  });
});
