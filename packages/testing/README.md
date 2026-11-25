# @webmcp-agents/testing

Test what you build with `@webmcp-agents/*`, with Vitest and nothing hand-written: a tool in Node, a tool on the page
with the cursor and a confirmation, an agent without a model, the `/api/chat` endpoint without a key, and where a secret
does or does not end up.

```sh
pnpm add -D @webmcp-agents/testing vitest @vitest/browser-playwright
pnpm exec playwright install chromium
```

## Configure

```ts
// vitest.config.ts
import { webAgentsProject } from "@webmcp-agents/testing/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { projects: [webAgentsProject("unit"), webAgentsProject("browser")] },
});
```

`*.test.*` files run in Node. `*.browser.test.*` files run in Chromium with `@webmcp-agents/testing/setup`: the WebMCP
polyfill is installed, motion is reduced so the cursor snaps, ids are deterministic, and after each test what it
mounted is removed. A test that leaves a tool call running, or a tool registered, fails with the tool's name.

## A tool on the page

```tsx
import { expect, test } from "@webmcp-agents/testing";

test("waits for the person before placing the order", async ({ tools, events, user, mount }) => {
  mount(<WebAgentsProvider><Checkout /></WebAgentsProvider>);
  await expect.poll(() => tools.list()).toContain("place_order");

  const call = tools.call("place_order");
  await expect.poll(() => events).toHaveParked("place_order");
  await user.confirm("Place order"); // a trusted click on the parked control
  expect(await call).toBeToolResult();
});
```

## An agent, without a model

```ts
import { mockAdapter, text, toolCall } from "@webmcp-agents/testing/chat";

const adapter = mockAdapter([toolCall("track_last_order"), toolCall("add_to_cart", { qty: 2 }), text("Done.")]);
const run = await shopper.invoke("Reorder my last purchase.", { adapter });

expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);
expect(run).toHaveAnswered("Done.");
```

A failing matcher says what happened, not just a diff:

```
expect(received).toHaveCalledTools(["track_last_order","add_to_cart"])

  Expected tools, in order:  track_last_order → add_to_cart
  Called:                    track_last_order → add_to_cart → place_order
                                                              ^ unexpected
  place_order input: {"confirm":true}
```

## Entries

| Entry | Contents |
|---|---|
| `@webmcp-agents/testing` | `test` with the fixtures (`tools`, `events`, `user`, `mount`, `redactor`), `callTool`, `mockTool`, page helpers, `expect`, `vi` |
| `/vitest` | `webAgentsProject("unit" \| "browser", options?)` |
| `/setup`, `/matchers` | setup files: everything, or the matchers alone (a page that must stay without WebMCP) |
| `/chat` | `mockAdapter`, `text`, `toolCall`, `reasoning`, `fail`, `mockChatServer`, `renderChat` (with `sentinelMessages`) |
| `/server` | `mockModel`, `chatRequest`, `readChatStream`, `withSession` |
| `/playwright` | `openApp`, `runTool`, `listTools`, `parkedOn`, `confirm` |
| `/telemetry` | `memoryExporter` (browser and OpenTelemetry spans in one shape), `spanTree` |

Vitest 4 or later is the one required peer. `@webmcp-agents/chat`, `@webmcp-agents/telemetry`, `ai`, `react`, `react-dom`, `@playwright/test` and
`@vitest/browser-playwright` are optional: an entry that needs a missing one fails at import with a sentence naming it.

`renderChat` and `toHaveNoHardcodedText` check the chat (the sentinel-catalog check: no string of the chat bypasses its
messages catalog). The `runs` fixture records every run event of the test (`onAgentRun`), which the run matchers read
(it tells `"max-steps"` from `"stop"`); the `spans` fixture records every browser span (`observeAgents`), which
`toHaveSpan`, `toBeOneTrace` and `toContainSensitive` read.

Never import this package from runtime code: it is for tests (the repository's lint enforces it for its own packages).

Docs: [webmcp-agents.dev/docs/reference/testing](https://webmcp-agents.dev/docs/reference/testing).
