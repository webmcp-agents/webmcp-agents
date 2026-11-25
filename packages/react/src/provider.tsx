/**
 * <WebAgentsProvider>: one place to say which tools the agent sees.
 *
 *   <WebAgentsProvider tools={tools}>
 *   <WebAgentsProvider tools={tools} availableTools={user ? [tools.getCart, tools.listOrders] : [tools.getCart]}>
 *
 * A thin wrapper over core's `createWebAgents`: `tools` is everything the app has, `availableTools` what an agent
 * may use right now (default: all of them), and a tool's own `match` says on which paths it is on. The URL is
 * followed by the library, so the same line works with any router. It installs the agent cursor itself, before
 * the first tool registers, so tools are animated without any ordering rule in the app. Where the browser has no
 * WebMCP it loads the polyfill (`polyfill`, default `"auto"`); the children render at once, on the server too, and
 * their tools register when it is there. In development it also installs the devtools panel (`devtools`), wired to
 * its cursor; a production build has no devtools code at all.
 *
 * Still supported, from before tools carried `match` and closed over their own state: an array catalog whose
 * tools are off until named in `global`, `routes` or by a mounted component (`useEnableTools`, `<EnableTools>`),
 * a `pathname` from the router, and `context`.
 *
 * Everything that would touch WebMCP on unmount is deferred a macrotask (StrictMode's mount → unmount → mount,
 * route swaps) and waits for in-flight calls, so tool definitions don't churn and Chrome doesn't cancel calls.
 */
import {
  type AgentVisualsOptions,
  type AvailableTools,
  createWebAgents,
  deferRelease,
  type PolyfillOption,
  matchPath,
  type RegisteredContext,
  type WebToolCatalog,
} from "@webmcp-agents/core";
import { configureRedaction, createRedactor, getRedactor, type RedactOptions, type Redactor } from "@webmcp-agents/core/redact";
import type { DevtoolsOptions } from "@webmcp-agents/devtools";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WebAgentsContext, type WebAgentsContextValue } from "./context";
import { useIsomorphicLayoutEffect } from "./use-isomorphic-layout-effect";
import { usePathname } from "./use-pathname";

const NO_TOOLS: WebToolCatalog = {};
const NO_NAMES: readonly string[] = [];
const NO_ROUTES: Readonly<Record<string, readonly string[]>> = {};
const SEP = "\u0000";

/** Bundlers replace `process.env.NODE_ENV` with a string; there is no `process` in a browser otherwise. */
declare const process: { env: { NODE_ENV?: string } };

/** Panel options for `<WebAgentsProvider devtools={…}>`: the devtools' own, but the cursor is always the provider's. */
export type ProviderDevtoolsOptions = Omit<DevtoolsOptions, "visuals">;

/** The devtools panel the providers installed: one per page, however many want it; the last to unmount removes it. */
interface Panel {
  users: number;
  dispose?: () => void;
  release?: { cancel(): void };
  gone?: boolean;
}
let panel: Panel | undefined;

export interface WebAgentsProviderProps {
  /**
   * Every tool the app has, as an object: `{ getCart, listOrders }`. All of them are on (each where its `match`
   * fits) unless `availableTools` says otherwise. Define it at module level or memoise it: a new object re-checks
   * every tool (only changed definitions re-register). Two tools with one id throw, naming both keys.
   *
   * An array is the earlier form and keeps its meaning: its tools are off until `global`, `routes`, a mounted
   * component or `availableTools` turns them on.
   */
  tools?: WebToolCatalog;
  /**
   * What an agent may use right now, decided by your own state: tools by reference (`tools.getCart`) or by their
   * key in `tools`. Default: every tool of an object catalog.
   */
  availableTools?: AvailableTools;
  /**
   * Options for the agent cursor, read when it installs (`spotlight` and `yieldToUser` also apply on change).
   * `false` installs nothing: tools still register, without animation. Default `{}`.
   */
  visuals?: AgentVisualsOptions | false;
  /** Earlier form: tool ids enabled on every page. A tool with no `match` in an object catalog needs none of this. */
  global?: readonly string[];
  /**
   * Earlier form: tool ids per route pattern (`/orders`, `/product/:slug`, `/flights/*`, `*`); every matching
   * pattern contributes. Today a tool says this itself, with `match`.
   */
  routes?: Readonly<Record<string, readonly string[]>>;
  /**
   * The path `routes` and the tools' `match` are tested against, when a router's idea of it should win. Default:
   * the browser's URL, followed by the library (the Navigation API, else `history`, plus back/forward and hash changes).
   */
  pathname?: string;
  /** Earlier form: app state handed to every catalog tool's execute as `ctx.context` (type it via the `Register` interface). */
  context?: RegisteredContext;
  /**
   * Where the browser has no `document.modelContext` (Firefox, Safari, Chrome without WebMCP), `"auto"` loads the
   * polyfill, a chunk of its own that browsers with WebMCP never download; the children render meanwhile and their
   * tools register once it is there. In production too, so every visitor gets the tools and the chat. `false` never
   * loads it: tools register only where the browser has WebMCP. Read once, on mount. Default `"auto"`.
   */
  polyfill?: PolyfillOption;
  /**
   * The devtools panel (launcher bottom-right, Alt+Shift+A, and `window.agent`), wired to this provider's cursor so
   * its Settings switches work. Only in development (`process.env.NODE_ENV === "development"`, as `vite dev`, `next
   * dev` and webpack's development mode set it): the provider loads `@webmcp-agents/devtools` with a dynamic
   * `import()` that bundlers drop from a production build, and tests (NODE_ENV "test") get no panel either. `false`
   * turns it off, e.g. to render `<WebAgentsDevtools />` yourself; an object turns it on with panel options
   * (`initialOpen`, `hotkey`, `initialSettings` such as `dock`), still in development only. Read once, on mount.
   * Default `true`.
   */
  devtools?: boolean | ProviderDevtoolsOptions;
  /**
   * The page's redaction rules (`configureRedaction`), applied before any tool registers: what the devtools log, the
   * chat's tool card, URLs and console lines leaving the page mask. Options extend or replace the defaults
   * (`{ keys: (d) => [...d, "loyaltyId"], allowQuery: ["page"] }`), or pass a ready `Redactor`. While the provider is
   * mounted its rules are the page's; unmounting puts back the ones before it. Read once, on mount. Default: the
   * library's default rules (passwords, tokens, keys, emails, card numbers), which are on without this prop.
   *
   * @example
   * <WebAgentsProvider tools={tools} redact={{ keys: (d) => [...d, "loyaltyId"], style: "indexed" }}>
   */
  redact?: RedactOptions | Redactor;
  children?: ReactNode;
}

export function WebAgentsProvider({
  tools = NO_TOOLS,
  availableTools,
  global = NO_NAMES,
  routes = NO_ROUTES,
  pathname,
  visuals = {},
  context,
  polyfill = "auto",
  devtools = true,
  redact,
  children,
}: WebAgentsProviderProps) {
  // ---------- 0. redaction: the page's rules, in place before any tool registers or logs ----------
  const [redactor] = useState(() => (redact === undefined || typeof redact === "function" ? redact : createRedactor(redact)));
  useIsomorphicLayoutEffect(() => {
    // Without the prop the default redactor is created now, so core's own console lines are redacted too.
    const before = getRedactor();
    if (!redactor) return;
    configureRedaction(redactor);
    return () => {
      if (getRedactor() === redactor) configureRedaction(before); // a provider mounted after this one keeps its own
    };
  }, [redactor]);

  // ---------- 1. context: tools read the latest value when they run ----------
  const contextRef = useRef(context);
  const getContext = useCallback(() => contextRef.current, []);
  useIsomorphicLayoutEffect(() => {
    contextRef.current = context;
  });

  // ---------- 2. the tools: createWebAgents, started by an effect ----------
  // An array catalog is opt-in, as it always was: nothing is on until something names it.
  const available = availableTools ?? (Array.isArray(tools) ? NO_NAMES : undefined);
  // Created during render, so it must do nothing yet: React may throw this render away (StrictMode does, on purpose).
  const [agents] = useState(() =>
    createWebAgents({ tools, availableTools: available, visuals, context: getContext, polyfill, start: false }),
  );

  // Layout effects run before the children's (passive) enables: the cursor is installed and the catalog current by then.
  // `destroy` releases each tool after its call in flight and defers the rest, so StrictMode's remount changes nothing.
  useIsomorphicLayoutEffect(() => {
    agents.start();
    return () => agents.destroy();
  }, [agents]);

  const lastCatalog = useRef(tools);
  useIsomorphicLayoutEffect(() => {
    if (lastCatalog.current === tools) return;
    lastCatalog.current = tools;
    agents.setTools(tools);
  }, [agents, tools]);

  // Keyed by value: an inline `availableTools={[tools.a, tools.b]}` is a new array on every render.
  const availableKey = available?.map((tool) => (typeof tool === "string" ? tool : tool.id)).join(SEP);
  const latestAvailable = useRef(available);
  latestAvailable.current = available;
  // `availableKey` is the dependency that matters; the list itself is read from the ref.
  useIsomorphicLayoutEffect(() => {
    agents.setAvailableTools(latestAvailable.current);
  }, [agents, availableKey]);

  useIsomorphicLayoutEffect(() => {
    agents.setPathname(pathname);
  }, [agents, pathname]);

  // ---------- 3. the cursor's runtime options ----------
  const spotlight = visuals === false ? undefined : visuals.spotlight;
  const yieldToUser = visuals === false ? undefined : visuals.yieldToUser;
  const spotlightKey = JSON.stringify(spotlight);
  const yieldKey = JSON.stringify(yieldToUser);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value, not by the (usually inline) object
  useEffect(() => {
    if (spotlight !== undefined) agents.visuals.setSpotlight(spotlight);
  }, [spotlightKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value, not by the (usually inline) object
  useEffect(() => {
    if (yieldToUser !== undefined) agents.visuals.setYieldToUser(yieldToUser);
  }, [yieldKey]);

  // ---------- 4. the devtools, in development only ----------
  const visualsOff = visuals === false;
  const [devtoolsOptions] = useState(() => (typeof devtools === "object" ? devtools : {}));
  const devtoolsOn = devtools !== false;
  // biome-ignore lint/correctness/useExhaustiveDependencies: options are read once, on mount, like the cursor's
  useEffect(() => {
    if (!devtoolsOn) return;
    try {
      // Literally `process.env.NODE_ENV`, in the condition around the import(): a bundler replaces it, sees a dead
      // branch in production and emits no devtools chunk. Not under "test" either (Vitest, Jest): an app's tests
      // would find the panel's launcher among their buttons. Without a bundler `process` throws: no devtools.
      if (process.env.NODE_ENV === "development") {
        if (!panel) {
          const mine: Panel = { users: 0 };
          panel = mine;
          import("@webmcp-agents/devtools").then(
            ({ installWebAgentsDevtools }) => {
              if (!mine.gone) mine.dispose = installWebAgentsDevtools({ ...devtoolsOptions, visuals: visualsOff ? null : agents.visuals });
            },
            (err) => console.error("[web-agents] the devtools could not load:", err),
          );
        }
        const mine = panel;
        mine.release?.cancel();
        mine.release = undefined;
        mine.users++;
        return () => {
          if (--mine.users) return;
          // Deferred like the tools: StrictMode's unmount → mount keeps the panel and its timeline.
          mine.release = deferRelease(() => {
            mine.gone = true;
            mine.dispose?.();
            if (panel === mine) panel = undefined;
          });
        };
      }
    } catch {
      // no bundler and no `process`: not development, as far as anyone can tell
    }
  }, [agents, devtoolsOn]);

  // ---------- 5. the earlier form: global ∪ matching routes, by id ----------
  const browserPathname = usePathname();
  const current = pathname ?? browserPathname;
  const scoped = new Set(global);
  for (const [pattern, names] of Object.entries(routes)) if (matchPath(pattern, current)) for (const n of names) scoped.add(n);
  const scopedKey = [...scoped].join(SEP);
  useEffect(() => agents.registry.enable(scopedKey ? scopedKey.split(SEP) : NO_NAMES), [agents, scopedKey]);

  const value = useMemo<WebAgentsContextValue>(
    () => ({
      registry: agents.registry,
      visuals: visualsOff ? null : agents.visuals,
      pathname: current,
      getContext,
      ensureVisuals: agents.start,
    }),
    [agents, visualsOff, current, getContext],
  );
  return <WebAgentsContext.Provider value={value}>{children}</WebAgentsContext.Provider>;
}
