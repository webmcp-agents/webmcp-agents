import type { AgentAdapter, AgentChatProps, ChatMessagesInput } from "@webmcp-agents/chat";
import { onTestFinished } from "vitest";
import { until } from "../helpers/wait";
import { requirePeer } from "../peer";
import { SENTINEL, sentinelOf } from "../sentinel";
import { loadChat, loadedChat } from "./chat-peer";

/** Options for {@link renderChat}. */
export interface RenderChatOptions {
  /** The adapter the chat runs (a `mockAdapter`). Default: one that answers nothing and is always ready. */
  adapter?: AgentAdapter;
  /** `<AgentChat>`'s other props (`messages`, `locale`, `theme`, `components`…). `defaultOpen` and `storageKey: false` are set. */
  props?: Partial<AgentChatProps>;
  /**
   * Render with the sentinel catalog: every entry of `en` becomes `⟦its.path⟧`, so any other letter on screen is a
   * string that bypassed the catalog (`toHaveNoHardcodedText`). Laid under `props.messages` when both are given.
   * Default false.
   */
  sentinel?: boolean;
  /** Wrap the chat (a `<WebAgentsProvider>`, an error boundary). Receives the chat as `children`. */
  wrapper?: (props: { children: unknown }) => unknown;
  /** How long to wait for the chat to mount (ms). Default 2000. */
  timeout?: number;
}

/** A rendered chat. Unmounted after the test (or call `unmount`). */
export interface RenderedChat {
  /** The chat's root (`[data-wa-part="root"]`, the body-level host): what `toHaveNoHardcodedText` reads. */
  readonly host: HTMLElement;
  /** The panel (`[data-wa-part="panel"]`). */
  readonly panel: HTMLElement;
  /** The first element of part `name` (`[data-wa-part="<name>"]`), or null. */
  part(name: string): HTMLElement | null;
  /** Every element of part `name`. */
  parts(name: string): HTMLElement[];
  /** Render again with other props (merged over the first ones). */
  rerender(props: Partial<AgentChatProps>): Promise<void>;
  /** Take the chat down now (it is taken down after the test anyway). */
  unmount(): void;
  /** The catalog it was rendered with when `sentinel` was set. */
  readonly messages?: ChatMessagesInput;
}

/** An adapter that is always ready and answers nothing: enough to render the idle chat. */
const silent: AgentAdapter = { id: "silent", label: "Silent", async *run() {} };

/**
 * The sentinel catalog: every leaf of the English catalog replaced by `⟦its.path⟧` (functions included), so a render
 * shows only markers where the chat's own words go.
 *
 * @example
 * sentinelMessages().composer.send; // "⟦composer.send⟧"
 */
export function sentinelMessages(): ChatMessagesInput {
  return sentinelOf(loadedChat().en) as ChatMessagesInput;
}

/**
 * Render `<AgentChat>` open for a test, with a mock adapter, and give back its host and parts. Needs a page (browser
 * mode) and React DOM. With `sentinel: true` every string the chat owns is a `⟦marker⟧`: pair it with
 * `toHaveNoHardcodedText`.
 *
 * @example
 * const chat = await renderChat({ adapter: mockAdapter([text("Hi.")]), sentinel: true });
 * await expect(chat).toHaveNoHardcodedText({ allow: ["Hi."] });
 */
export async function renderChat(options: RenderChatOptions = {}): Promise<RenderedChat> {
  if (typeof document === "undefined") throw new Error("renderChat() needs a page: run this test in browser mode (a *.browser.test file).");
  const by = "renderChat()";
  const [{ createElement }, client, dom, chat] = await Promise.all([
    requirePeer(() => import("react"), { peer: "react", by }),
    requirePeer(() => import("react-dom/client"), { peer: "react-dom", by }),
    requirePeer(() => import("react-dom"), { peer: "react-dom", by }),
    loadChat(by),
  ]);
  const before = new Set(document.querySelectorAll('[data-web-agents-ui="chat"]'));
  const container = document.createElement("div");
  document.body.append(container);
  const root = client.createRoot(container);
  const messages = options.sentinel ? sentinelMessages() : undefined;
  let props: Partial<AgentChatProps> = { ...options.props };
  const element = () => {
    const merged: AgentChatProps = {
      adapter: options.adapter ?? silent,
      defaultOpen: true,
      storageKey: false,
      ...props,
      ...(messages && { messages: chat.deepMerge(messages as never, props.messages ?? {}) as ChatMessagesInput }),
    };
    const ui = createElement(chat.AgentChat, merged);
    return options.wrapper ? createElement(options.wrapper as never, null, ui) : ui;
  };
  dom.flushSync(() => root.render(element()));
  let mounted = true;
  const unmount = (): void => {
    if (!mounted) return;
    mounted = false;
    root.unmount();
    container.remove();
  };
  try {
    onTestFinished(unmount);
  } catch {
    // called outside a test (a hook, a script): the caller unmounts
  }
  const find = (): HTMLElement | undefined =>
    [...document.querySelectorAll<HTMLElement>('[data-web-agents-ui="chat"]')].find(
      (el) => !before.has(el) && el.querySelector('[data-wa-part="panel"]'),
    );
  await until(() => !!find(), options.timeout ?? 2000).catch(() => {
    unmount();
    throw new Error(`renderChat(): the chat did not mount within ${options.timeout ?? 2000} ms (no [data-wa-part="panel"] appeared).`);
  });
  const host = find()!;
  return {
    host,
    get panel() {
      return host.querySelector<HTMLElement>('[data-wa-part="panel"]')!;
    },
    part: (name) => host.querySelector<HTMLElement>(`[data-wa-part="${CSS.escape(name)}"]`),
    parts: (name) => [...host.querySelectorAll<HTMLElement>(`[data-wa-part="${CSS.escape(name)}"]`)],
    async rerender(next) {
      props = { ...props, ...next };
      dom.flushSync(() => root.render(element()));
      await new Promise((r) => setTimeout(r, 0));
    },
    unmount,
    ...(messages && { messages }),
  };
}

export { SENTINEL };
