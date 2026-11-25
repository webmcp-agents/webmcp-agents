/**
 * createWebAgents: the framework-free way to put an app's tools on a page.
 *
 *   const agents = createWebAgents({ tools });
 *   agents.setAvailableTools([tools.getTime, tools.getCart]);
 *
 * It installs the agent cursor, registers every catalog tool that is available and whose `match` fits the path,
 * and follows the browser's URL itself, so nothing has to be wired to a router. Where the browser has no WebMCP it
 * loads the polyfill (a chunk of its own) and the tools register once it is there. `<WebAgentsProvider>` is a thin
 * wrapper over it. On the server it does nothing.
 */
import { STAGE, type Stage, stages, type ToolControls } from "./confirm";
import { deferRelease } from "./deferred";
import { loadWebMCPPolyfill, type PolyfillOption, whenModelContext } from "./model-context";
import { matchPath } from "./path-match";
import { createToolRegistry, type ToolRegistry } from "./registry";
import { type AgentVisuals, type AgentVisualsOptions, installAgentVisuals } from "./visuals";
import { toModelContextTool, type WebTool } from "./web-tool";

/** Every tool an app has: an object (a tool cannot be listed twice, and code refers to `tools.getCart`), or an array. */
export type WebToolCatalog = Readonly<Record<string, WebTool>> | readonly WebTool[];

/** Tools an agent may use right now: each by reference (`tools.getCart`), by its key in the catalog, or by its id. */
export type AvailableTools = readonly (WebTool | string)[];

/** Options for `createWebAgents`. */
export interface WebAgentsOptions {
  /** Everything the app has. Two tools with one id throw, naming both. */
  tools: WebToolCatalog;
  /** What an agent may use right now. Default: all of `tools`. */
  availableTools?: AvailableTools;
  /** Options for the agent cursor, read when it installs. `false` installs nothing: tools still register. Default `{}`. */
  visuals?: AgentVisualsOptions | false;
  /** Read on every call and passed to `execute` as `ctx.context`. For apps written before tools closed over their own state. */
  context?: () => unknown;
  /**
   * Where the browser has no `document.modelContext` (Firefox, Safari, Chrome without WebMCP), `"auto"` loads the
   * polyfill, a chunk of its own that browsers with WebMCP never download, and the cursor and the tools wait for it.
   * In production too, so every visitor gets the tools and the chat. `false` never loads it: tools then register
   * only where the browser has WebMCP (elsewhere `registerWebTool` warns once). Read on `start()`. Default `"auto"`.
   */
  polyfill?: PolyfillOption;
  /**
   * `false`: do nothing until `start()` (no listeners, no cursor, no registration). For a framework binding that
   * has to create this during a render it may throw away. Default true.
   */
  start?: boolean;
}

/** What `createWebAgents` returns. */
export interface WebAgents {
  /** Change what an agent may use right now; `undefined` for every catalog tool. A tool that leaves is released once its call in flight is answered. */
  setAvailableTools(tools: AvailableTools | undefined): void;
  /** Swap the catalog. Only tools whose definition changed re-register. */
  setTools(tools: WebToolCatalog): void;
  /**
   * Stop: no more URL tracking, every tool released (each after its call in flight is answered), the cursor removed
   * a moment later. `start()` before then picks up where it left, without re-registering anything.
   */
  destroy(): void;
  /** Start (again). Called for you unless the `start` option was false. Does nothing on the server or when started. */
  start(): void;
  /** Match tools against this path instead of the browser's URL (a router's own idea of the path); `undefined` to follow the URL again. */
  setPathname(pathname: string | undefined): void;
  /** The registry behind it: enable a catalog tool by hand while a part of the page is on screen (`registry.enable([id])`). */
  readonly registry: ToolRegistry;
  /**
   * Change the cursor's spotlight and yielding at runtime. Before the cursor is installed (the polyfill is loading) a
   * change is kept as its starting option; with `visuals: false` it does nothing.
   */
  readonly visuals: Pick<AgentVisuals, "setSpotlight" | "setYieldToUser">;
}

const watchers = new Set<() => void>();
let stopWatching: (() => void) | undefined;

/** Listen to everything that changes the URL without loading a page. Returns how to stop. */
function startWatching(): () => void {
  let queued = false;
  // After the navigation call returns, once per burst: Next.js changes the URL inside a React insertion effect,
  // where telling React about it (a store listener, a tool registering) is an error.
  const notify = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const watcher of [...watchers]) watcher();
    });
  };
  const listening = new AbortController();
  const options = { signal: listening.signal };
  const restore: Array<() => void> = [];
  const navigation = (globalThis as { navigation?: EventTarget }).navigation;
  // The Navigation API sees every same-document navigation. Without it (Firefox < 147, older Safari), `history` is
  // patched for as long as someone watches: routers call pushState / replaceState, which fire no event.
  if (navigation) navigation.addEventListener("currententrychange", notify, options);
  else
    for (const method of ["pushState", "replaceState"] as const) {
      const original = history[method];
      const patched: History["pushState"] = function (this: History, ...args) {
        original.apply(this, args);
        notify();
      };
      history[method] = patched;
      // someone may have patched it after us: then ours stays, and notifies no one
      restore.push(() => {
        if (history[method] === patched) history[method] = original;
      });
    }
  addEventListener("popstate", notify, options);
  addEventListener("hashchange", notify, options);
  return () => {
    listening.abort();
    for (const undo of restore) undo();
  };
}

/**
 * Call `listener` whenever the page's URL changes without a page load: `history.pushState` / `replaceState`
 * (so every client-side router), back and forward, and hash changes. Returns an unsubscribe function. Nothing is
 * listened to or patched while no one watches; on the server it does nothing.
 */
export function watchPathname(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  watchers.add(listener);
  stopWatching ??= startWatching();
  return () => {
    if (!watchers.delete(listener) || watchers.size) return;
    stopWatching?.();
    stopWatching = undefined;
  };
}

/** The path a tool's `match` is tested against: the URL's pathname, or for a hash router the route in the hash (`#/orders` → `/orders`). */
const currentPath = (): string => (location.hash.startsWith("#/") ? (location.hash.slice(1).split("?")[0] as string) : location.pathname);

/** True when a tool with this `match` is on at `path`. No `match`: everywhere. */
const fits = (match: WebTool["match"], path: string): boolean =>
  match === undefined || (match instanceof RegExp ? path.search(match) >= 0 : [match].flat().some((pattern) => matchPath(pattern, path)));

/** Every started `createWebAgents`: its catalog (for `inspectTools`) and its cursor controls, null with `visuals: false`. */
const started = new Map<() => readonly WebTool[], WebAgents["visuals"] | null>();

/**
 * The cursor controls of the most recently started `createWebAgents` (so of `<WebAgentsProvider>`) that has a cursor,
 * or null. For tools that sit beside it without a handle on it, like the devtools' Settings switches.
 */
export function currentAgentVisuals(): WebAgents["visuals"] | null {
  let last: WebAgents["visuals"] | null = null;
  for (const visuals of started.values()) last = visuals ?? last;
  return last;
}

/**
 * One tool as `inspectTools` sees it: its definition, whether its `match` fits here, and where the cursor would act
 * and type. Whether it is registered right now is what `document.modelContext.getTools()` lists.
 */
export interface ToolInspection extends ToolControls {
  /** The definition: `match`, the flags, `requireConfirmation`, `title`. */
  tool: WebTool;
  /** Its `match` fits the current path (always true without one). */
  fits: boolean;
}

/** Catalog + registered WebTools on this page (registered wins). Empty on the server. */
function pageWebTools(): Map<string, WebTool> {
  const all = new Map<string, WebTool>();
  for (const catalog of started.keys()) for (const tool of catalog()) all.set(tool.id, tool);
  for (const [id, stage] of stages) all.set(id, stage.tool); // what is registered wins: it is what an agent calls
  return all;
}

/**
 * The live `WebTool` for `id` on this page (registered, else a started catalog), or `undefined`. Used by chat
 * restore to call optional `revert`. Empty on the server.
 */
export function getRegisteredWebTool(id: string): WebTool | undefined {
  return pageWebTools().get(id);
}

/**
 * Every WebTool on this page: the registered ones and the catalog tools of each started `createWebAgents` (on or
 * off here), with the control each would act on and the field each parameter would be typed into, found the way the
 * cursor finds them. For devtools; elements are live, so read it when you show it. Empty on the server.
 */
export function inspectTools(): ToolInspection[] {
  // nothing is registered or started on the server, so the browser globals below are read only in a browser
  return [...pageWebTools().values()].map((tool) => ({
    tool,
    fits: fits(tool.match, currentPath()),
    ...(stages.get(tool.id) ?? (toModelContextTool(tool) as unknown as { [STAGE]: Stage })[STAGE]).inspect(),
  }));
}

/**
 * Put an app's tools on the page, without a framework: install the agent cursor, register every tool of `tools`
 * that is available (`availableTools`, default all) and whose `match` fits the current path, and keep that true as
 * the visitor navigates. A tool that stops being on is released only after its call in flight is answered. Where
 * the browser has no WebMCP it first loads the polyfill (see `polyfill`); tools registered meanwhile wait for it.
 * Throws when two tools share an id. On the server it returns the same object and does nothing.
 */
export function createWebAgents({
  tools,
  availableTools,
  visuals = {},
  context,
  polyfill = "auto",
  start = true,
}: WebAgentsOptions): WebAgents {
  /** Catalog key → tool id, for `availableTools` given by key. */
  let ids = new Map<string, string>();
  let catalog: WebTool[] = [];
  const index = (next: WebToolCatalog): void => {
    const seen = new Map<string, string>();
    for (const [key, { id }] of Object.entries(next)) {
      const label = Array.isArray(next) ? `tools[${key}]` : `tools.${key}`;
      if (seen.has(id)) throw new Error(`Duplicate tool id "${id}": ${seen.get(id)} and ${label}`);
      seen.set(id, label);
    }
    ids = new Map(Object.entries(next).map(([key, tool]) => [key, tool.id]));
    catalog = Object.values(next);
  };
  index(tools);

  let available = availableTools;
  let pathname: string | undefined;
  let installed: AgentVisuals | undefined;
  let teardown: { cancel(): void } | undefined;
  /** Set while started. */
  let stop: (() => void) | undefined;
  /** Releases the tools that are on. */
  let held: (() => void) | undefined;
  let on: string | undefined;
  /** The polyfill is loading: the cursor (it binds to `document.modelContext` when it installs) and the tools wait. */
  let waiting = false;

  const ensureVisuals = (): void => {
    if (stop && !waiting && visuals !== false) installed ??= installAgentVisuals(visuals);
  };
  const registry = createToolRegistry(catalog, { beforeRegister: ensureVisuals, context });
  const listed = (): readonly WebTool[] => catalog;

  /** Register what is available and matches the path now; release what no longer does (deferred, see the registry). */
  const apply = (): void => {
    if (!stop || waiting) return;
    const path = pathname ?? currentPath();
    const allowed = available && new Set(available.map((tool) => (typeof tool === "string" ? (ids.get(tool) ?? tool) : tool.id)));
    const next = catalog.filter((tool) => (!allowed || allowed.has(tool.id)) && fits(tool.match, path)).map((tool) => tool.id);
    if (next.join() === on) return;
    on = next.join();
    const release = held;
    held = registry.enable(next); // before the release: a tool in both sets is never unregistered
    release?.();
  };

  const agents: WebAgents = {
    registry,
    // Before the cursor installs (the polyfill is loading), a change becomes its starting option.
    visuals: {
      setSpotlight(spotlight) {
        if (installed) installed.setSpotlight(spotlight);
        else if (visuals) visuals = { ...visuals, spotlight };
      },
      setYieldToUser(yieldToUser) {
        if (installed) installed.setYieldToUser(yieldToUser);
        else if (visuals) visuals = { ...visuals, yieldToUser };
      },
    },
    start() {
      if (stop || typeof document === "undefined") return;
      teardown?.cancel();
      stop = watchPathname(apply);
      started.set(listed, visuals === false ? null : agents.visuals);
      if (polyfill && !document.modelContext && !waiting) {
        // Kept across destroy(): it was queued before any tool's registration, so the cursor is in place first.
        waiting = true;
        whenModelContext(() => {
          waiting = false;
          ensureVisuals();
          apply();
        });
        // A chunk that fails to load (offline, a blocked CDN) is a readable error, not an unhandled rejection; the
        // page itself keeps working, and the tools register if a later load succeeds.
        loadWebMCPPolyfill().catch((err) => console.error("[web-agents] the WebMCP polyfill could not load:", err));
      }
      ensureVisuals(); // before the first tool registers, so the cursor can hold it
      apply();
    },
    setTools(next) {
      index(next);
      registry.update(catalog);
      on = undefined;
      apply();
    },
    setAvailableTools(next) {
      available = next;
      apply();
    },
    setPathname(path) {
      pathname = path;
      apply();
    },
    destroy() {
      if (!stop) return;
      stop();
      started.delete(listed);
      stop = on = undefined;
      held?.();
      // Deferred: a restart in the same tick (React StrictMode) keeps the layer, and the registerTool wrapper live tools rely on.
      teardown = deferRelease(() => {
        installed?.destroy();
        installed = undefined;
      });
    },
  };
  if (start) agents.start();
  return agents;
}
