---
slug: reference/core
description: "@webmcp-agents/core shows the person on the page what a WebMCP agent is doing: a ghost cursor that types, clicks and parks for a confirmation."
---

# `@webmcp-agents/core`

`@webmcp-agents/core` shows the person using a page what a WebMCP agent is doing: a ghost cursor that glides to the tool, types the agent's values, clicks, and parks on a submit button while the browser waits for confirmation. The visual layer is driven only by WebMCP lifecycle events, so tools don't know it exists, and it gets out of the way the moment the user moves. The package also holds the tool model shared by the other `@webmcp-agents/*` packages: `defineWebTool` (a tool is `execute`, plus an optional `target`), `createWebAgents` (the framework-free entry that follows the URL), a locator that finds controls by role and name, a ref-counted tool registry, deferred release helpers, error codes for tool results, a cross-browser `executeTool`, and the WebMCP types.

```sh
pnpm add @webmcp-agents/core
```

```ts
import { createWebAgents, defineWebTool } from "@webmcp-agents/core";
import "@webmcp-agents/core/cursor.css";

const getCart = defineWebTool({
  id: "get_cart",
  description: "Read the cart: lines and total.",
  readOnly: true,
  execute: () => ({ lines: 2, total: "$46.00" }),
});

createWebAgents({ tools: { getCart } });
```

## Define and run tools

The APIs a reader meets first: define a tool, put the catalog on the page, find controls.

| API | Description |
|---|---|
| [`defineWebTool`](./define-web-tool.md) | Define a tool once for WebMCP, devtools and server agents; `tool.invoke` calls it like an agent. Includes `WebTool`, `WebToolConfig`, `WebToolContext`, `Register`, `RegisteredContext`, `TargetFn`, `ToolTarget`, `WebToolAnnotations`, `WebToolInputError`. |
| [`createWebAgents`](./create-web-agents.md) | Put an app's tools on the page without a framework: installs the cursor, registers tools by availability and `match`, follows the URL. Includes `WebAgentsOptions`, `WebAgents`, `WebToolCatalog`, `AvailableTools`, and `getRegisteredWebTool`. |
| [`locate`](./locate.md) | Find a control by role and accessible name. Includes `ToolLocator`, `FieldTarget`. |
| [`matchPath`](./match-path.md) | Match a pathname against a route pattern, as a tool's `match` does. |
| [`watchPathname`](./watch-pathname.md) | Call a listener whenever the URL changes without a page load. |
| [`currentAgentVisuals`](./current-agent-visuals.md) | The cursor controls of the started `createWebAgents` or provider, for UI beside it (the devtools' Settings). |
| [`inspectTools`](./inspect-tools.md) | Where each tool's cursor would go and what it would type, as the cursor finds it. Includes `ToolInspection`, `ToolControls`. |

## Visual layer

| API | Description |
|---|---|
| [`installAgentVisuals`](./install-agent-visuals.md) | Install the ghost cursor, spotlight and yield-to-user layer. Includes `AgentVisualsOptions`, `AgentVisuals`, `SpotlightOptions`, `YieldOptions`. |
| [`@webmcp-agents/core/cursor.css`](./cursor-css.md) | The stylesheet for the cursor, ring, tag, spotlight and agent states; `cursor-native.css` (optional) adds Chrome's native states. |
| [`onAgentEvent`](./on-agent-event.md) | Subscribe to agent activity. Includes `AgentEvent`. |
| [`waitingForUser`](./waiting-for-user.md) | Say that a tool is waiting for the person. |
| [`UI_HOST_ATTR`](./ui-host-attr.md) | The attribute that marks library UI, so input there never yields the cursor. |

## Registering tools

Usually done for you by `createWebAgents`, the registry or the React hooks; reach for these to register by hand.

| API | Description |
|---|---|
| [`registerWebTool`](./register-web-tool.md) | Register a `WebTool` (or a function returning one) with `document.modelContext`. |
| [`toModelContextTool`](./to-model-context-tool.md) | Adapt a `WebTool` to the shape `registerTool` takes. Includes `ToModelContextToolOptions`. |
| [`createToolRegistry`](./create-tool-registry.md) | Decide which catalog tools are registered, ref-counted. Includes `ToolRegistry`, `ToolRegistryOptions`. |
| [`createCallTracker`](./create-call-tracker.md) | Count a tool's in-flight calls. Includes `CallTracker`. |
| [`deferRelease`](./defer-release.md) | Unregister later, after calls settle. Includes `RESPONSE_GRACE_MS`, `DeferReleaseOptions`. |
| [`webToolSignature`](./web-tool-signature.md) | The part of a tool WebMCP sees, as a string to compare. |
| [`isWebMCPAvailable`](./is-webmcp-available.md) | Check whether the page has `document.modelContext`. |
| [`loadWebMCPPolyfill`](./load-webmcp-polyfill.md) | Load the polyfill where the browser has no WebMCP, as `createWebAgents` does. Includes `PolyfillOption`, and the `@webmcp-agents/core/polyfill` entries. |
| [`whenModelContext`](./when-model-context.md) | Run code once the page has `document.modelContext`, native or polyfilled. |
| [`ConfirmationUnavailableError`](./confirmation-unavailable-error.md) | Thrown when a confirm-gated tool has no control to click, or several. |

## Calling tools and results

| API | Description |
|---|---|
| [`executeTool`](./execute-tool.md) | Call a page's tool by name like an agent, across Chrome builds and the polyfill. Includes `normalizeToolResult`, `ExecuteToolOptions`. |
| [`toolError`](./tool-error.md) | Build and read coded failures. Includes `ToolErrorCode`, `RETRYABLE`, `toolErrorCode`. |
| [`WebToolError`](./web-tool-error.md) | Throw from a tool to pick the error code the agent gets. |
| [`errorResult`](./error-result.md) | Small result helpers: `errorResult`, `errorText`, `isErrorText`, `isAbortError`, `toToolResult`. |
| [WebMCP types](./webmcp-types.md) | `ModelContext`, `ModelContextTool`, `ModelContextToolInfo`, `ModelContextToolResult`, `ModelContextExecuteOptions`, `ToolEvent`, `JSONSchema`, and the globals. |

The Build pages teach the same APIs in order: [Define a tool](../../build/define-a-tool.mdx) is the first.
