/**
 * @webmcp-agents/testing: test WebMCP tools, confirmations, agents and privacy with Vitest.
 *
 *   import { expect, test } from "@webmcp-agents/testing";
 *
 *   test("adds to the cart", async ({ tools, events, mount }) => {
 *     mount(<WebAgentsProvider><Catalog /></WebAgentsProvider>);
 *     expect(await tools.call("add_to_cart_mug-01", { qty: 2 })).toBeToolResult(/2 × Field Mug/);
 *     expect(events).toHaveFilled("qty", "2");
 *   });
 *
 * Importing it registers the matchers. Config: `@webmcp-agents/testing/vitest`. Agents and the chat:
 * `/chat`. The endpoint: `/server`. End to end: `/playwright`.
 */
import "./matchers";

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, vi } from "vitest";
export { type FakeUser, fakeUser, type UserTarget } from "./fake-user";
export { cleanupFixtures, cursorVisible, byText, deepText, FIXTURE_CLASS, fixture, uiRoot } from "./helpers/dom";
export { type AgentEventOf, type EventLog, isEventLog, recordEvents } from "./helpers/events";
export { type EchoFormOptions, echoForm, type ToolFormOptions, toolForm } from "./helpers/forms";
export { uniqueName } from "./helpers/names";
export {
  type CallToolOptions,
  callTool,
  countToolChanges,
  type MockedTool,
  type MockToolDefinition,
  type MockToolImpl,
  mockTool,
  modelContext,
  resultText,
  toolNames,
} from "./helpers/tools";
export { sleep, type UntilOptions, until } from "./helpers/wait";
export type { WebAgentsMatchers } from "./matchers";
export type { NoHardcodedTextOptions } from "./matchers/to-have-no-hardcoded-text";
export type { Mount, Mountable } from "./mount";
export { NotYetAvailableError } from "./not-yet";
export type { FinishReason, RecordedCall, RecordedFinish, RunRecord } from "./run-record";
export { type RunLog, type SpansFixture, type ToolsFixture, test, type WebAgentsFixtures } from "./test";
