/**
 * @webmcp-agents/testing/server: test `/api/chat` (`createChatHandler`) with no provider key and no network.
 *
 *   const handler = createChatHandler({ model: mockModel([toolCall("add_to_cart"), text("Added.")]), session: true });
 *   const send = await withSession(handler);
 *   const parts = await readChatStream(await send(chatRequest({ messages: ["Add a mug"], tools: ["add_to_cart"] })));
 *
 * Needs `ai` (for `ai/test`): importing this entry without it fails with a sentence naming it.
 */
import { requirePeer } from "../peer";
import { provideAiTest } from "./mock-model";

provideAiTest(await requirePeer(() => import("ai/test"), { peer: "ai", by: "@webmcp-agents/testing/server" }));

export { fail, reasoning, type Step, type StepCall, type StepError, type StepInput, type StepUsage, text, toolCall } from "../script";
export { type MockModel, type MockModelCall, mockModel } from "./mock-model";
export {
  CHAT_URL,
  type ChatHandler,
  type ChatRequestBody,
  type ChatRequestOptions,
  type ChatStreamPart,
  chatRequest,
  readChatStream,
  withSession,
} from "./request";
