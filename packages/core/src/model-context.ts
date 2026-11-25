/**
 * When the page has `document.modelContext`. Chrome with WebMCP has it from the start; everywhere else
 * `createWebAgents` (so `<WebAgentsProvider>` too) loads the polyfill, a chunk of its own, and the tools registered
 * meanwhile wait here instead of being dropped.
 */

/** `"auto"`: load the polyfill where the browser has no WebMCP. `false`: never load it; tools need native WebMCP. */
export type PolyfillOption = "auto" | false;

const waiting = new Set<(mc: ModelContext) => void>();
let loading: Promise<ModelContext | undefined> | undefined;

/** True while the polyfill is loading: a tool registered now waits for it. */
export const polyfillLoading = (): boolean => !!loading && !document.modelContext;

/**
 * Call `listener` once the page has `document.modelContext`: right away when it has, else when the polyfill
 * installs it (loaded by `createWebAgents`, `<WebAgentsProvider>` or `loadWebMCPPolyfill`). Returns how to stop
 * waiting. On the server it never calls. For UI that reads the tools (devtools, chat) and may start first.
 */
export function whenModelContext(listener: (mc: ModelContext) => void): () => void {
  if (typeof document === "undefined") return () => {};
  if (document.modelContext) listener(document.modelContext);
  else waiting.add(listener);
  return () => waiting.delete(listener);
}

/**
 * Give the page `document.modelContext`: nothing to do where the browser has WebMCP; elsewhere load the polyfill (its
 * own chunk, fetched only then) and install it. Once per page; `createWebAgents` calls it unless `polyfill: false`.
 * Resolves to the ModelContext (undefined on the server); rejects when the chunk failed to load.
 */
export function loadWebMCPPolyfill(): Promise<ModelContext | undefined> {
  const mc = typeof document === "undefined" ? undefined : document.modelContext;
  if (mc || typeof document === "undefined") return Promise.resolve(mc);
  loading ??= import("./polyfill/index").then(
    (polyfill) => {
      const installed = polyfill.installWebMCPPolyfill() as ModelContext;
      // the tools registered while it loaded register now, in the order they came
      for (const listener of waiting) {
        waiting.delete(listener);
        try {
          listener(installed);
        } catch (err) {
          console.error(err); // one failure never keeps the next tool from registering
        }
      }
      return installed;
    },
    (err) => {
      loading = undefined; // the next call tries again; tools registered meanwhile keep waiting
      throw err;
    },
  );
  return loading;
}
