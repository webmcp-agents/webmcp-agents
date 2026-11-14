/**
 * `go_back`: one step back in the browser's history, like the Back button. With the Navigation API it says where
 * that is, and refuses when there is nowhere to go back to on this site.
 */
import { defineWebTool, RESPONSE_GRACE_MS, type WebTool, WebToolError } from "@webmcp-agents/core";
import { addressSettles, type CommonToolOptions } from "./shared";

/** Options for `goBack`. */
export type GoBackOptions = CommonToolOptions;

const DESCRIPTION =
  'Go back one page in the browser\'s history, like the Back button. Use when the user says "go back", "back" or "the previous page". Needs nothing first. Next: the tools of the page you land on; get_page tells you where you are.';

interface NavigationLike {
  canGoBack?: boolean;
  currentEntry?: { index: number } | null;
  entries?(): Array<{ url: string | null; sameDocument?: boolean }>;
}

/** The `go_back` tool: `history.back()`. */
export function goBack({ id = "go_back", description = DESCRIPTION }: GoBackOptions = {}): WebTool<Record<string, never>, string> {
  return defineWebTool<Record<string, never>, string>({
    id,
    title: "Go back",
    description,
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      const navigation = (globalThis as { navigation?: NavigationLike }).navigation;
      if (navigation?.canGoBack === false || (!navigation && history.length <= 1))
        throw new WebToolError("unavailable", "There is no previous page to go back to in this tab.");
      const index = navigation?.currentEntry?.index;
      const entry = index ? navigation?.entries?.()[index - 1] : undefined;
      const previous = entry?.url ?? undefined;
      const where = previous
        ? ((url: URL) => (url.origin === location.origin ? url.pathname + url.search + url.hash : url.href))(new URL(previous))
        : "the previous page";
      if (entry?.sameDocument) {
        // a client router changes the address a moment later: answer once it has
        const from = location.href;
        history.back();
        await addressSettles(() => location.href !== from);
        return `Went back to ${where}.`;
      }
      if (entry) {
        // another document: answer first, so the agent hears it before this document goes
        setTimeout(() => history.back(), RESPONSE_GRACE_MS);
        return `Going back to ${where}: the page is loading.`;
      }
      // no Navigation API: whether the page stays is unknown, so answer at once
      history.back();
      return "Went back one page.";
    },
  });
}
