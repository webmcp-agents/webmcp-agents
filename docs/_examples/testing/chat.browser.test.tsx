import { expect, test } from "@webmcp-agents/testing";
import {
  mockAdapter,
  renderChat,
  text,
} from "@webmcp-agents/testing/chat";
import { userEvent } from "vitest/browser";

test("shows every string from the catalog", async () => {
  const chat = await renderChat({
    adapter: mockAdapter([text("Two mugs are in your cart.")]),
    sentinel: true,
  });
  await userEvent.type(chat.part("input")!, "Add two mugs{Enter}");
  await expect
    .poll(() => chat.panel.textContent)
    .toContain("Two mugs are in your cart.");

  // The person's message and the model's answer are allowed;
  // any other text is a string the catalog does not cover.
  expect(chat).toHaveNoHardcodedText({
    allow: ["Add two mugs", "Two mugs are in your cart."],
  });
});

test("uses your words", async () => {
  const chat = await renderChat({
    props: { messages: { composer: { placeholder: "Ask Field" } } },
  });
  const input = chat.part("input");
  expect(input?.getAttribute("placeholder")).toBe("Ask Field");
});

test("mirrors in Arabic", async () => {
  const chat = await renderChat({ props: { locale: "ar" } });
  expect(chat.host.closest("[dir]")?.getAttribute("dir")).toBe("rtl");
});
