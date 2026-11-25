/**
 * @webmcp-agents/testing/chat: test agents and the chat without a model.
 *
 *   const adapter = mockAdapter([toolCall("track_last_order"), toolCall("add_to_cart", { qty: 2 }), text("Done.")]);
 *   const run = await shopper.invoke("Reorder my last purchase.", { adapter });
 *   expect(run).toHaveCalledTools(["track_last_order", "add_to_cart"]);
 *
 * Needs `@webmcp-agents/chat`: importing this entry without it fails with a sentence naming it.
 */
import { requirePeer } from "../peer";

await requirePeer(() => import("@webmcp-agents/chat/agent"), { peer: "@webmcp-agents/chat", by: "@webmcp-agents/testing/chat" });

export {
  fail,
  reasoning,
  type Step,
  type StepCall,
  type StepError,
  type StepInput,
  type StepUsage,
  type TextOptions,
  text,
  toolCall,
} from "../script";
export {
  type MockAdapter,
  type MockAdapterOptions,
  type MockRequest,
  type MockScript,
  type MockStepResult,
  type MockTurn,
  mockAdapter,
} from "./mock-adapter";
export {
  type CannedResponse,
  type MockChatServer,
  type MockChatServerOptions,
  type MockChatServerRequest,
  mockChatServer,
} from "./mock-chat-server";
export { type RenderChatOptions, type RenderedChat, renderChat, SENTINEL, sentinelMessages } from "./render-chat";
