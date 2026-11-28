import { defineChatTheme } from "@webmcp-agents/chat";

// Level 2: the same variables as data. One theme for both schemes,
// or one per scheme, as here.
export const theme = defineChatTheme({
  light: {
    color: { accent: "#0f62fe", bg: "#ffffff", fg: "#161616" },
    radius: { panel: "16px" },
  },
  dark: {
    color: { accent: "#78a9ff", bg: "#161616", fg: "#f4f4f4" },
  },
});
