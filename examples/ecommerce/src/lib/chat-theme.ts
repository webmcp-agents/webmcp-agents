import { defineChatTheme } from "@webmcp-agents/chat";

/** The assistant in the shop's colors, one set per scheme (see docs: Theme the chat). Declared once, outside the render. */
export const chatTheme = defineChatTheme({
  light: {
    color: { accent: "#1f5f4a", accentInk: "#ffffff" },
    radius: { panel: "18px" },
  },
  dark: {
    color: { accent: "#7fd1b0", accentInk: "#0b2a20" },
  },
});
