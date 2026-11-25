import type { AgentAdapter } from "@webmcp-agents/chat";
import { notYet } from "../not-yet";

/** Options for {@link renderChat}. Completed with the chat's messages catalog (0.5.0, phase 3). */
export interface RenderChatOptions {
  /** The adapter the chat runs (a `mockAdapter`). */
  adapter?: AgentAdapter;
  /** `<AgentChat>`'s other props. */
  props?: Record<string, unknown>;
}

/** A rendered chat. Completed in phase 3 of 0.5.0. */
export interface RenderedChat {
  /** The chat's host element. */
  readonly host: HTMLElement;
}

/**
 * Render `<AgentChat>` for a test, open, with a mock adapter, and give back its host for `toHaveNoHardcodedText`.
 * A typed shell until the chat's messages catalog and slots land (0.5.0, phase 3): calling it fails with a sentence
 * saying so. Until then, render `<AgentChat adapter={mockAdapter(…)} defaultOpen />` with `vitest-browser-react`.
 */
export async function renderChat(_options: RenderChatOptions = {}): Promise<RenderedChat> {
  return notYet("renderChat()", "chat-theming");
}
