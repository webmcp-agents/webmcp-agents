/**
 * `@webmcp-agents/chat`, loaded once through `requirePeer`. The modules of `./chat` import it only as types and read
 * its values from here, so no static value import runs before the entry's check: a missing chat fails with the
 * sentence naming it, never with a bare ERR_MODULE_NOT_FOUND.
 */
import type * as Chat from "@webmcp-agents/chat";
import { requirePeer } from "../peer";

let chat: typeof Chat | undefined;

/**
 * Load `@webmcp-agents/chat` (once). Rejects with one sentence naming the package when it is not installed.
 *
 * @param by Who needs it, for that sentence (`"@webmcp-agents/testing/chat"`, `"The runs fixture"`).
 */
export async function loadChat(by: string): Promise<typeof Chat> {
  chat ??= await requirePeer(() => import("@webmcp-agents/chat"), { peer: "@webmcp-agents/chat", by });
  return chat;
}

/**
 * The chat module, for synchronous code that runs after {@link loadChat} resolved (the `./chat` entry awaits it at
 * import, the `runs` fixture before it records).
 */
export function loadedChat(): typeof Chat {
  if (!chat) throw new Error("@webmcp-agents/chat is not loaded yet: import from @webmcp-agents/testing/chat, which loads it.");
  return chat;
}
