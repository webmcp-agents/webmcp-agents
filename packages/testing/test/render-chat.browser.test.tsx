import { mockAdapter, renderChat, SENTINEL, sentinelMessages, text } from "@webmcp-agents/testing/chat";
import { describe, expect } from "vitest";
import { test } from "../src/test";

describe("renderChat", () => {
  test("renders the chat open and finds its parts", async () => {
    const chat = await renderChat({ adapter: mockAdapter([text("Hi.")]) });
    expect(chat.panel.hidden).toBe(false);
    expect(chat.host.getAttribute("data-wa-part")).toBe("root");
    expect(chat.part("input")?.getAttribute("placeholder")).toBe("Ask about this page");
    expect(chat.parts("close")).toHaveLength(1);
  });

  test("with the sentinel catalog, every string is a marker", async () => {
    const chat = await renderChat({ sentinel: true });
    expect(chat.part("input")?.getAttribute("placeholder")).toBe("⟦composer.placeholder⟧");
    expect(chat.part("emptyHint")?.textContent).toBe("⟦empty.hint⟧");
    expect((sentinelMessages() as { launcher: { open: string } }).launcher.open).toBe("⟦launcher.open⟧");
    expect("⟦a.b⟧ ⟦c⟧".replace(SENTINEL, "")).toBe(" ");
    await expect(chat).toHaveNoHardcodedText();
  });

  test("rerender merges new props; unmount takes the chat down", async () => {
    const chat = await renderChat();
    await chat.rerender({ title: "Shop helper" });
    expect(chat.part("title")?.textContent).toBe("Shop helper");
    chat.unmount();
    expect(chat.host.isConnected).toBe(false);
  });
});

describe("toHaveNoHardcodedText", () => {
  test("names each string that is not a marker, and where it is", async () => {
    const chat = await renderChat({ sentinel: true, props: { title: "Shop helper" } });
    expect(() => expect(chat).toHaveNoHardcodedText()).toThrow(/text "Shop helper" in <h2 data-wa-part="title">/);
    await expect(chat).toHaveNoHardcodedText({ allow: ["Shop helper"] });
  });

  test("reads attributes too, and allows patterns", () => {
    const el = document.createElement("div");
    el.innerHTML = `<button aria-label="Close">⟦x⟧</button><p>42% · ⟦y⟧</p><p>User said hi</p>`;
    expect(() => expect(el).toHaveNoHardcodedText({ allow: [/User said \w+/g] })).toThrow(/aria-label "Close" on <button>/);
    el.querySelector("button")!.setAttribute("aria-label", "⟦close⟧");
    expect(el).toHaveNoHardcodedText({ allow: [/User said \w+/g] });
    expect(el).not.toHaveNoHardcodedText();
  });

  test("a value that is not a chat or an element is a worded error, under .not too", () => {
    expect(() => expect(42).toHaveNoHardcodedText()).toThrow(/reads a rendered chat \(what renderChat\(\) returns\) or an element/);
    expect(() => expect(42).not.toHaveNoHardcodedText()).toThrow(/reads a rendered chat/);
  });
});
