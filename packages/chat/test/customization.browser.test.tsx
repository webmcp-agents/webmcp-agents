/**
 * Customization in a real page: theme → variables and colors (R-CHAT-3), classes and state hooks (R-CHAT-4), slots and
 * `unstyled` (R-CHAT-5), locale and direction (R-CHAT-6), and what 0.4.0 pages relied on (R-CHAT-7).
 */
import { waitingForUser } from "@webmcp-agents/core";
import { Component, type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../src/chat.css";
import { AgentChat } from "../src/components/AgentChat";
import { en } from "../src/customize/en";
import { themeToCssVars } from "../src/customize/theme";
import type { ChatComponents } from "../src/customize/types";
import { ar } from "../src/locales/ar";
import { es } from "../src/locales/es";
import { useAgentChat } from "../src/session/use-agent-chat";
import type { AgentAdapter, AgentStreamPart } from "../src/types";
import { callTool, mockTool, test, until } from "@webmcp-agents/testing";
import { mockAdapter, renderChat } from "@webmcp-agents/testing/chat";

/** A computed colour as sRGB 0–255, whatever notation the browser reports it in. */
function rgb(color: string): [number, number, number] {
  const ctx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r ?? 0, g ?? 0, b ?? 0];
}
const bg = (el: Element | null): [number, number, number] => rgb(getComputedStyle(el as Element).backgroundColor);
const fg = (el: Element | null): [number, number, number] => rgb(getComputedStyle(el as Element).color);

/** The OS color scheme, through Chrome's DevTools protocol (reduced motion kept, as the kit's setup set it). */
async function osScheme(scheme: "light" | "dark"): Promise<void> {
  const session = cdp() as unknown as { send(method: string, params: unknown): Promise<unknown> };
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: scheme },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });
}

const extraStyles: HTMLStyleElement[] = [];
/** A stylesheet of the page's own, after chat.css. */
function pageCss(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  extraStyles.push(style);
}

afterEach(async () => {
  for (const s of extraStyles.splice(0)) s.remove();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("dir");
  html.lang = "en";
  html.removeAttribute("style");
  await osScheme("light");
  await page.viewport(414, 896);
});

const RED: [number, number, number] = [255, 0, 0];

describe("theme (R-CHAT-3)", () => {
  test("a theme value becomes the variable on the chat's root, and the launcher wears it", async () => {
    const chat = await renderChat({ props: { theme: { color: { accent: "red" } }, defaultOpen: false } });
    expect(getComputedStyle(chat.host).getPropertyValue("--wa-chat-color-accent").trim()).toBe("red");
    expect(bg(chat.part("launcher"))).toEqual(RED);
  });

  test("light and dark: the OS picks, colorScheme forces", async () => {
    const theme = { light: { color: { accent: "rgb(0, 0, 255)" } }, dark: { color: { accent: "rgb(0, 128, 0)" } } };
    await osScheme("dark");
    const chat = await renderChat({ props: { theme } });
    expect(bg(chat.part("send"))).toEqual([0, 128, 0]);
    await chat.rerender({ colorScheme: "light" });
    expect(chat.host.dataset.theme).toBe("light");
    expect(bg(chat.part("send"))).toEqual([0, 0, 255]);
    await chat.rerender({ colorScheme: "auto" });
    expect(chat.host.hasAttribute("data-theme")).toBe(false);
    expect(bg(chat.part("send"))).toEqual([0, 128, 0]);
    await osScheme("light");
    expect(bg(chat.part("send"))).toEqual([0, 0, 255]);
  });

  test("without React: variables on an element style the chat inside it from its first frame", async () => {
    for (const [name, value] of Object.entries(themeToCssVars({ color: { accent: "#ff0000", bg: "#00ff00" } })))
      document.documentElement.style.setProperty(name, value);
    const chat = await renderChat();
    expect(bg(chat.part("send"))).toEqual(RED);
    expect(bg(chat.panel)).toEqual([0, 255, 0]);
  });

  test("an app's plain `button { color: inherit }` does not beat the chat (no cascade layer)", async () => {
    pageCss("button { color: inherit; background: none; }");
    document.documentElement.setAttribute("data-theme", "light");
    const chat = await renderChat({ props: { theme: { color: { accent: "red", accentInk: "rgb(255, 255, 255)" } } } });
    expect(bg(chat.part("send"))).toEqual(RED);
    expect(fg(chat.part("send"))).toEqual([255, 255, 255]);
  });

  test("an unknown theme key from JSON writes nothing", async () => {
    const theme = JSON.parse('{"color": {"accent": "red", "nope": "blue", "bg": "x; color: red"}, "nope": {"a": "b"}}');
    const chat = await renderChat({ props: { theme } });
    const written = [...chat.host.style].filter((p) => p.startsWith("--"));
    expect(written).toEqual(["--wa-chat-color-accent"]);
  });
});

describe("0.4.0 pages (R-CHAT-7)", () => {
  test("a page that sets only --wa-chat-accent gets a red launcher and send button", async () => {
    pageCss(".wa-chat { --wa-chat-accent: red; }");
    document.documentElement.setAttribute("data-theme", "light");
    const chat = await renderChat({ props: { defaultOpen: false } });
    expect(bg(chat.part("launcher"))).toEqual(RED);
    await userEvent.click(chat.part("launcher")!);
    expect(bg(chat.part("send"))).toEqual(RED);
  });

  test("an ancestor's data-theme=dark wins over a light OS; the chat's own data-theme=light wins over a dark OS", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const dark = await renderChat();
    const darkBg = bg(dark.panel);
    expect((darkBg[0] + darkBg[1] + darkBg[2]) / 3).toBeLessThan(60);
    dark.unmount();
    document.documentElement.removeAttribute("data-theme");
    await osScheme("dark");
    const light = await renderChat();
    light.host.setAttribute("data-theme", "light");
    expect(bg(light.panel)).toEqual([255, 255, 255]);
  });

  test("every 0.4.0 prop still works: title, position, layout, className, suggestions", async () => {
    const chat = await renderChat({
      props: { title: "Shop helper", position: "bottom-left", layout: "floating", className: "mine", suggestions: ["Track my order"] },
    });
    expect(chat.part("title")?.textContent).toBe("Shop helper");
    expect(chat.host.dataset.position).toBe("bottom-left");
    expect(chat.host.dataset.layout).toBe("floating");
    expect(chat.host.classList.contains("mine")).toBe(true);
    expect(chat.host.classList.contains("wa-chat")).toBe(true);
    expect(chat.part("suggestion")?.textContent).toBe("Track my order");
    expect(chat.part("launcher")?.getAttribute("aria-label")).toBe("Close shop helper");
  });
});

describe("parts (R-CHAT-4)", () => {
  test("classNames add to the built-in classes; styles set inline styles", async () => {
    const chat = await renderChat({
      props: {
        classNames: { send: "btn btn-primary", root: "root-class" },
        styles: { launcher: { insetInlineEnd: 24 }, panel: { opacity: 0.9 } },
      },
    });
    expect([...chat.part("send")!.classList]).toEqual(["wa-chat__send", "btn", "btn-primary"]);
    expect(chat.host.classList.contains("root-class")).toBe(true);
    expect(chat.part("launcher")!.style.insetInlineEnd).toBe("24px");
    expect(chat.panel.style.opacity).toBe("0.9");
  });

  test("a parked tool's card matches [data-wa-part=toolCard][data-state=awaiting-confirmation]; state hooks on the rest", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const adapter = mockAdapter(async function* () {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "t1", name: "place_order", input: {} };
      await held;
      yield { type: "finish", reason: "stop" };
    });
    const chat = await renderChat({ adapter });
    await userEvent.type(chat.part("input")!, "Order it{Enter}");
    await until(() => chat.part("toolCard") !== null, 3000, "card");
    expect(chat.panel.dataset.busy).toBe("true");
    expect(chat.part("launcher")?.dataset.busy).toBe("true");
    expect(chat.part("message")?.dataset.role).toBe("user");
    waitingForUser("place_order", "Click Place order.");
    await until(() => !!chat.host.querySelector('[data-wa-part="toolCard"][data-state="awaiting-confirmation"]'), 3000, "parked");
    expect(chat.panel.dataset.open).toBe("true");
    release();
    await until(() => chat.part("send") !== null, 3000, "idle");
  });
});

// ---------- replacement parts, at module scope (a component defined inside a function remounts every render) ----------
const MyToolCard: ChatComponents["ToolCard"] = ({ partProps, call, t }) => (
  <div {...partProps} className={`my-tool ${partProps.className ?? ""}`}>
    <strong>{call.tool}</strong> <span>{t("tool.running", { tool: call.tool })}</span>
  </div>
);
const SLOTS: Partial<ChatComponents> = {
  Header: ({ partProps, title, close }) => (
    <header {...partProps}>
      <span data-testid="h">{title}</span>
      <button type="button" onClick={close}>
        x
      </button>
    </header>
  ),
  Empty: ({ partProps, children, t }) => (
    <div {...partProps}>
      <p data-testid="empty">{t("empty.hint").slice(0, 8)}</p>
      {children}
    </div>
  ),
  Icon: ({ name }) => <i data-icon={name} />,
  Text: ({ partProps, text }) => <q {...partProps}>{text}</q>,
  Message: ({ partProps, message, children }) => (
    <section {...partProps} data-testid={`m-${message.role}`}>
      {children}
    </section>
  ),
  Reasoning: ({ partProps, text }) => <details {...partProps}>{text}</details>,
  Restore: ({ partProps, ask }) => (
    <button type="button" {...partProps} onClick={ask}>
      rewind
    </button>
  ),
};
const MORE_SLOTS: Partial<ChatComponents> = {
  Launcher: ({ partProps, open, toggle }) => (
    <button type="button" {...partProps} onClick={toggle}>
      {open ? "close" : "open"}
    </button>
  ),
  Composer: ({ partProps, value, setValue, send }) => (
    <form
      {...partProps}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <input aria-label="msg" value={value} onChange={(e) => setValue(e.target.value)} />
    </form>
  ),
  Error: ({ partProps, code, t, retry }) => (
    <div {...partProps} role="alert">
      {code}: {t(`errors.${code}`)} {retry ? "retry" : ""}
    </div>
  ),
};
const BrokenHeader: ChatComponents["Header"] = () => {
  throw new Error("my header broke");
};
class Boundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p id="boundary">The chat failed</p> : this.props.children;
  }
}

describe("slots and unstyled (R-CHAT-5)", () => {
  test("a replaced ToolCard renders with its call, and spreading partProps keeps the hooks", async () => {
    const adapter = mockAdapter(async function* () {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "tool-call", messageId: "a1", id: "t1", name: "add_to_cart", input: { qty: 1 } } satisfies AgentStreamPart;
      yield { type: "finish", reason: "stop" };
    });
    const chat = await renderChat({
      adapter,
      props: { components: { ToolCard: MyToolCard }, messages: { tool: { running: "Working on {tool}…" } } },
    });
    await userEvent.type(chat.part("input")!, "Add a mug{Enter}");
    await until(() => chat.part("toolCard") !== null, 3000, "card");
    const card = chat.part("toolCard")!;
    expect(card.classList.contains("my-tool")).toBe(true);
    expect(card.classList.contains("wa-chat__tool")).toBe(true);
    expect(card.dataset.state).toBe("running");
    expect(card.textContent).toBe("add_to_cart Working on add_to_cart…");
  });

  test("other slots: Launcher, Header, Composer, Empty, Error, Icon, Text, Message, Reasoning, Restore", async () => {
    const adapter = mockAdapter(async function* () {
      yield { type: "message-start", messageId: "a1" };
      yield { type: "reasoning", messageId: "a1", text: "Thinking it over" };
      yield { type: "text-delta", messageId: "a1", delta: "Hi there." };
      yield { type: "finish", reason: "stop" };
    });
    const chat = await renderChat({ adapter, props: { components: SLOTS } });
    expect(chat.host.querySelector('[data-testid="h"]')?.textContent).toBe("Assistant");
    expect(chat.host.querySelector('[data-testid="empty"]')?.textContent).toBe("Ask me t");
    expect(chat.host.querySelector('i[data-icon="send"]')).not.toBeNull();
    await userEvent.type(chat.part("input")!, "Hello{Enter}");
    // the person's words go through the same Text part: the model's reply is the last one
    await until(() => [...chat.host.querySelectorAll("q")].at(-1)?.textContent === "Hi there.", 3000, "text");
    expect(chat.host.querySelector("q")?.textContent).toBe("Hello");
    expect(chat.part("reasoning")?.textContent).toBe("Thinking it over");
    expect(chat.host.querySelector('[data-testid="m-assistant"]')?.getAttribute("data-wa-part")).toBe("message");
    expect(chat.part("restore")?.textContent).toBe("rewind");

    const failing: AgentAdapter = {
      id: "f",
      label: "F",
      async *run() {
        yield { type: "error", error: "x", code: "rate_limited" };
      },
    };
    const second = await renderChat({ adapter: failing, props: { components: MORE_SLOTS } });
    expect(second.part("launcher")?.textContent).toBe("close");
    await userEvent.type(second.host.querySelector("input")!, "Go{Enter}");
    await until(() => second.part("error") !== null, 3000, "error");
    expect(second.part("error")?.textContent).toBe(`rate_limited: ${en.errors.rate_limited} retry`);
  });

  test("unstyled: no library class or theme variable, the same roles, labels and keys", async () => {
    const chat = await renderChat({ props: { unstyled: true, theme: { color: { accent: "red" } } } });
    const classed = [chat.host, ...chat.host.querySelectorAll("[class]")].filter((el) => /\bwa-chat/.test(el.getAttribute("class") ?? ""));
    expect(classed).toEqual([]);
    expect([...chat.host.style].filter((p) => p.startsWith("--wa-chat"))).toEqual([]);
    expect(getComputedStyle(chat.host).position).not.toBe("fixed");
    expect(chat.panel.getAttribute("role")).toBe("dialog");
    expect(chat.part("input")?.getAttribute("aria-label")).toBe("Message the assistant");
    expect(chat.part("launcher")?.getAttribute("aria-label")).toBe("Close assistant");
    expect(chat.part("close")?.getAttribute("aria-label")).toBe("Close assistant");
    chat.part("input")!.focus();
    await userEvent.keyboard("{Escape}");
    expect(chat.panel.hidden).toBe(true);
    expect(document.activeElement).toBe(chat.part("launcher"));
  });

  test("a replacement that throws reaches the app's error boundary; the page's tools keep working", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const tool = mockTool("still_here", async () => "ok");
    await render(
      <Boundary>
        <AgentChat adapter={mockAdapter([])} storageKey={false} defaultOpen components={{ Header: BrokenHeader }} />
      </Boundary>,
    );
    await until(() => !!document.getElementById("boundary"), 3000, "boundary");
    expect(await callTool("still_here")).toBeToolResult("ok");
    tool.unregister();
    error.mockRestore();
  });
});

describe("locale and direction (R-CHAT-6)", () => {
  test("Arabic mirrors: dir=rtl and the docked panel on the left half", async () => {
    await page.viewport(1100, 800);
    const chat = await renderChat({ props: { locale: "ar", messages: ar } });
    expect(chat.host.dir).toBe("rtl");
    expect(chat.host.lang).toBe("ar");
    expect(chat.panel.closest("[dir]")?.getAttribute("dir")).toBe("rtl");
    expect(chat.panel.getBoundingClientRect().left).toBeLessThan(innerWidth / 2);
    expect(document.documentElement.dataset.waChatDock).toBe("left");
  });

  test("floating in RTL: the launcher sits on the left", async () => {
    await page.viewport(1100, 800);
    const chat = await renderChat({ props: { locale: "ar", layout: "floating", defaultOpen: false } });
    expect(chat.part("launcher")!.getBoundingClientRect().left).toBeLessThan(innerWidth / 2);
  });

  test("with no locale and no dir, the page's <html dir> (or its lang) decides", async () => {
    document.documentElement.setAttribute("dir", "rtl");
    const fromDir = await renderChat();
    expect(fromDir.host.dir).toBe("rtl");
    fromDir.unmount();
    document.documentElement.removeAttribute("dir");
    document.documentElement.lang = "he";
    const fromLang = await renderChat();
    expect(fromLang.host.dir).toBe("rtl");
    expect(fromLang.host.lang).toBe("he");
  });

  test("an explicit dir wins over the locale", async () => {
    const chat = await renderChat({ props: { locale: "ar", dir: "ltr" } });
    expect(chat.host.dir).toBe("ltr");
  });

  test("an invalid locale falls back to English formatting without throwing", async () => {
    const chat = await renderChat({ props: { locale: "not a locale!" } });
    expect(chat.host.lang).toBe("en");
    expect(chat.host.dir).toBe("ltr");
  });

  test.each([
    ["ar", ar],
    ["es", es],
  ] as const)("the shipped %s catalog: no English string anywhere on screen", async (locale, messages) => {
    const chat = await renderChat({ props: { locale, messages, suggestions: false } });
    const english = new Set(
      JSON.stringify(en)
        .match(/"[^"]{4,}"/g)!
        .map((s) => s.slice(1, -1)),
    );
    const shown = [
      chat.host.textContent ?? "",
      ...[...chat.host.querySelectorAll("*")].flatMap((el) => [
        el.getAttribute("aria-label") ?? "",
        el.getAttribute("placeholder") ?? "",
        el.getAttribute("title") ?? "",
      ]),
    ];
    expect(shown.filter((s) => english.has(s.trim()))).toEqual([]);
    expect(chat.part("input")?.getAttribute("placeholder")).toBe(messages.composer.placeholder);
  });
});

/** A chat UI of its own on `useAgentChat`, in Spanish: it records the error it is given. */
const rateLimited: AgentAdapter = {
  id: "f",
  label: "F",
  async *run() {
    yield { type: "error", error: "You're sending messages too fast.", code: "rate_limited" };
  },
};
function Headless({ seen }: { seen: string[] }) {
  const chat = useAgentChat({ adapter: rateLimited, storageKey: false, messages: es, locale: "es" });
  useEffect(() => {
    if (chat.error) seen.push(chat.error.text, chat.error.code, chat.error.message);
  }, [chat.error, seen]);
  return (
    <button type="button" onClick={() => chat.sendMessage({ text: "Hola" })}>
      send
    </button>
  );
}

describe("headless: useAgentChat({ messages, locale }) (R-CHAT-1)", () => {
  test("the error text comes from that catalog", async () => {
    const seen: string[] = [];
    const screen = await render(<Headless seen={seen} />);
    await screen.getByRole("button").click();
    await until(() => seen.length > 0, 3000, "error");
    expect(seen).toEqual([es.errors.rate_limited, "rate_limited", "You're sending messages too fast."]);
  });
});
