import { themeToCssVars } from "@webmcp-agents/chat";

// A page without React, or a server render that should not flash:
// the theme as CSS variables, on any element above the chat.
const vars = themeToCssVars({ color: { accent: "#e11d48" } });
for (const [name, value] of Object.entries(vars)) {
  document.documentElement.style.setProperty(name, value);
}
