# @webmcp-agents/tools

Common WebMCP tools, ready-made. Each factory returns a tool from `defineWebTool`: put it in your catalog beside your
own, and an agent can ask what day it is, where the user is, what page they are on, go somewhere, go back, show a
section, or switch the theme.

```sh
pnpm add @webmcp-agents/tools @webmcp-agents/core
```

```ts
// tools/index.ts
import { getLocation, getPage, getTime, goBack, goTo, scrollTo, setTheme } from "@webmcp-agents/tools";

export const tools = {
  getTime: getTime(),
  getLocation: getLocation(),
  getPage: getPage(),
  goTo: goTo({ pages: { home: "/", cart: "/cart", orders: "/orders" } }),
  goBack: goBack(),
  scrollTo: scrollTo(),
  setTheme: setTheme(),

  getCart,
  listOrders,
};
```

```tsx
<WebAgentsProvider tools={tools}>
  <App />
</WebAgentsProvider>
```

| Tool | Factory | Answers or does |
|---|---|---|
| `get_time` | `getTime({ locale? })` | The user's date, time, time zone and locale; what "tomorrow", "this weekend", "next Friday" mean for them, by their locale's week. Read-only. |
| `get_location` | `getLocation({ lookup?, prompt?, timeoutMs? })` | Coordinates after the browser's permission prompt (the call says it waits for the user meanwhile), the time zone and the language's country. City, region and country with your `lookup`. Read-only. |
| `get_page` | `getPage({ maxHeadings? })` | Title, path, query parameters, hash, language, the selected text, and the headings. Read-only. |
| `go_to` | `goTo({ pages })` | Opens one of the pages you list, by name: clicks the page's own link to it (so your router handles it), else loads the URL. |
| `go_back` | `goBack()` | One step back in history, and where that is. |
| `scroll_to` | `scrollTo({ highlightMs? })` | Scrolls to a heading or a piece of text, highlights it, and quotes the start of that section. |
| `set_theme` | `setTheme({ get?, set?, control? })` | Light, dark or system: presses the site's theme switch when there is one, else calls `set`. |

Every factory also takes `{ id?, description? }` to rename a tool or reword what the agent reads.

- **No framework, no router, no app state.** Nothing touches the DOM until a tool runs, so they are safe to define
  on the server. Import only what you use.
- **`get_location` sends nothing anywhere by default.** Pass `lookup` to name the place:

  ```ts
  getLocation({
    lookup: async ({ lat, lon }, signal) => {
      const res = await fetch(`/api/place?lat=${lat}&lon=${lon}`, { signal });
      return res.ok ? res.json() : undefined; // { city, region, country }
    },
  });
  ```

  With a `lookup` the tool is marked `external`.
- **`set_theme` finds the switch by its name**, like the cursor finds any control: a switch or button named "Theme",
  "Dark mode", "Toggle theme"… Point it elsewhere with `control: { role: "button", name: "Appearance" }`, or pass
  `get` and `set` when your theme lives in state:

  ```ts
  setTheme({ get: () => theme.current, set: (next) => theme.set(next) });
  ```

## Docs

- [API reference](https://github.com/webmcp-agents/webmcp-agents/blob/main/docs/reference/tools/README.md)
