import { describe, expect, test } from "vitest";
import { isMissingModule, missingPeerMessage, requirePeer } from "../src/peer";

describe("a missing optional peer", () => {
  test("fails with one sentence naming the package to install", async () => {
    const name = "@webmcp-agents/not-installed";
    const error = await requirePeer(() => import(/* @vite-ignore */ name), { peer: name, by: "@webmcp-agents/testing/chat" }).catch(
      (err: Error) => err,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "@webmcp-agents/testing/chat needs @webmcp-agents/not-installed, which is not installed: add it to your devDependencies (pnpm add -D @webmcp-agents/not-installed).",
    );
    expect((error as Error).message.split(". ").length).toBe(1); // one sentence
  });

  test("the chat entry's sentence names @webmcp-agents/chat", () => {
    expect(missingPeerMessage({ peer: "@webmcp-agents/chat", by: "@webmcp-agents/testing/chat" })).toBe(
      "@webmcp-agents/testing/chat needs @webmcp-agents/chat, which is not installed: add it to your devDependencies (pnpm add -D @webmcp-agents/chat).",
    );
  });

  test("Vite's and Node's not-found errors count; an error the package threw does not", async () => {
    expect(isMissingModule(Object.assign(new Error("Cannot find package 'ai'"), { code: "ERR_MODULE_NOT_FOUND" }), "ai")).toBe(true);
    expect(isMissingModule(new Error('Could not resolve "ai/test" imported by "x". Is it installed?'), "ai")).toBe(true);
    expect(isMissingModule(new Error("ai broke while loading"), "ai")).toBe(false);
    const boom = new Error("boom");
    await expect(requirePeer(() => Promise.reject(boom), { peer: "ai", by: "x" })).rejects.toBe(boom);
  });

  test("an installed peer loads", async () => {
    const mod = await requirePeer(() => import("@webmcp-agents/chat/agent"), { peer: "@webmcp-agents/chat", by: "test" });
    expect(typeof mod.defineWebAgent).toBe("function");
  });
});
