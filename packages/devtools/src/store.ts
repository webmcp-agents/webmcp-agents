/**
 * The devtools' state, independent of any UI: the page's tools, every call
 * (run from the panel or by a real agent), and the panel's settings.
 *
 * Sources: `getTools()` on `toolchange`, core's `onAgentEvent` (fills, the
 * confirmation park, results, the user taking over), and its own `runTool`.
 * Snapshots are immutable and serialisable (no DOM references), so React can
 * read them with `useSyncExternalStore` and the TanStack bridge can post them.
 *
 * Redaction: what a record holds (arguments, fills, result, error) is redacted when it is recorded, by the page's
 * redactor and the tool's `sensitive` fields, so the panel, "copy as code" and the TanStack bridge never carry a
 * secret. In development the values as they were are kept beside the records, for the panel's "Reveal values".
 *
 * Limitation: core events carry no call id, so an event belongs to the newest
 * unfinished call of its tool. Two concurrent calls of one tool may mix up.
 */
import {
  type AgentEvent,
  type AgentVisuals,
  errorText,
  executeTool,
  getRegisteredWebTool,
  inspectTools,
  isAbortError,
  type ModelContextToolInfo,
  type ModelContextToolResult,
  onAgentEvent,
  type ToolInspection,
  toToolResult,
  watchPathname,
  whenModelContext,
} from "@webmcp-agents/core";
import { getRedactor, toolSensitivity } from "@webmcp-agents/core/redact";
import { isFailure, NAVIGATED } from "./execute";
import { type ControlView, controlView, type FieldView, type FlagView, fieldViews, flagViews, hintsOf, matchText } from "./inspect";
import { parseSchema, type SchemaNode } from "./schema";

declare global {
  interface Window {
    /** Set by the devtools: play the agent from the browser console. */
    agent?: {
      /**
       * Call a tool the way an agent would (cursor, typing, confirmation), recorded in the timeline:
       * `await agent.invoke("add_to_cart", { quantity: 2 })`. Resolves with the tool's result.
       */
      invoke(name: string, args?: Record<string, unknown>): Promise<ModelContextToolResult | undefined>;
      /** The same as `invoke` (its earlier name). */
      run(name: string, args?: Record<string, unknown>): Promise<ModelContextToolResult | undefined>;
      list(): Promise<ModelContextToolInfo[]>;
    };
  }
}

/** A registered tool, as the panel shows it. */
export interface ToolView {
  name: string;
  title?: string;
  description: string;
  /** The parsed input schema (Chrome serialises it to a string). */
  schema: SchemaNode;
  annotations: Record<string, unknown>;
  /** `declarative`: a `<form toolname>`; `imperative`: registered with `registerTool`. */
  kind: "declarative" | "imperative";
  /** It has a control on the page (its form, the control core resolves, or a `toolname` element), so Locate can find it. */
  onScreen: boolean;
  /** The browser or the tool waits for the user's click: a form without `toolautosubmit`, or `requireConfirmation`. */
  confirms: boolean;
  /** Registered with `document.modelContext` right now. False for a catalog tool whose `match` does not fit here. */
  registered: boolean;
  /** A tool from `defineWebTool`: where the cursor acts, as core resolves it right now. Absent for other tools. */
  control?: ControlView;
  /** A tool from `defineWebTool`: each parameter and the field the cursor would type it into. */
  fields?: FieldView[];
  /** Its `match` as written (`/orders`, `/cart, /checkout`, a RegExp). Absent: on everywhere. */
  match?: string;
  /** Its `match` fits the current path (true without one). */
  fits: boolean;
  /** Its flags (`readOnly`, `destructive`, …) as badges, from its WebMCP annotations. */
  flags: FlagView[];
}

/** `waiting`: the browser paused for the user's confirmation click. */
export type CallStatus = "running" | "waiting" | "ok" | "error" | "cancelled";

/** One field the agent typed into, `at` in epoch ms. */
export interface CallFill {
  field: string;
  value: string | boolean;
  at: number;
}

/** One tool call. Times are epoch ms. */
export interface CallRecord {
  id: string;
  tool: string;
  /** `devtools`: run from the panel or `window.agent`; `agent`: anything else (a browser agent, the chat widget). */
  origin: "devtools" | "agent";
  /** Known for devtools calls and agents' imperative calls; a declarative form's are only seen through `fills`. */
  args?: unknown;
  fills: CallFill[];
  status: CallStatus;
  startedAt: number;
  endedAt?: number;
  result?: ModelContextToolResult;
  error?: string;
  /** What the user is asked to do while `status` is `waiting`. */
  prompt?: string;
}

/** The user took over (the cursor yielded) or went quiet again. */
export interface TimelineMarker {
  id: string;
  type: "yield" | "resume";
  reason?: string;
  at: number;
}

/** The panel's tabs. */
export type DevtoolsTab = "tools" | "timeline" | "settings";

/** What the user can change in the panel; persisted once changed. */
export interface DevtoolsSettings {
  open: boolean;
  tab: DevtoolsTab;
  dock: "bottom" | "right";
  /** Panel height (bottom dock) or width (right dock), in px. */
  size: number;
  spotlight: boolean;
  yieldToUser: boolean;
}

/** One snapshot of everything the panel shows. Immutable; a new object per change. */
export interface DevtoolsState {
  tools: ToolView[];
  /** Newest first, capped at `maxCalls`. */
  calls: CallRecord[];
  /** Newest first, capped at `maxCalls`. */
  markers: TimelineMarker[];
  settings: DevtoolsSettings;
  /** `document.modelContext` exists. */
  supported: boolean;
  /**
   * Calls an agent started can be cancelled from the page (only the polyfill implements `cancelTool`).
   * The panel's own runs can always be cancelled: they pass a signal to `executeTool`.
   */
  canCancel: boolean;
  /** Spotlight and yield-to-user switches have a visuals controller to drive. */
  hasVisuals: boolean;
  /** A development build: the panel offers "Reveal values" (the unredacted arguments, fills and results). */
  canReveal: boolean;
  /** The panel shows the values as they were, and copies them so. Only ever true where `canReveal`. Default false. */
  revealed: boolean;
}

/** A call's values before redaction (`DevtoolsStore.raw`): kept in development builds only. */
export type RawCall = Pick<CallRecord, "args" | "fills" | "result" | "error" | "prompt">;

/** The part of the visuals controller the settings drive. */
export type DevtoolsVisuals = Pick<AgentVisuals, "setSpotlight" | "setYieldToUser">;

/** Options for `createDevtoolsStore`. */
export interface DevtoolsStoreOptions {
  /** The agent cursor to drive from Settings. Default null: the switches are disabled. */
  visuals?: DevtoolsVisuals | null;
  /** localStorage key for settings the user changed. Default "web-agents-devtools". */
  storageKey?: string;
  /** Calls (and markers) kept in the timeline; older ones drop off. Default 200. */
  maxCalls?: number;
  /** Starting settings, below whatever the user saved. Pass `spotlight` matching the visuals you installed. */
  initialSettings?: Partial<DevtoolsSettings>;
  /** Clock in epoch ms. Default Date.now. */
  now?: () => number;
}

/** The devtools state plus its actions. `subscribe` + `getSnapshot` fit `useSyncExternalStore`. */
export interface DevtoolsStore {
  getSnapshot(): DevtoolsState;
  /** Called after every change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Re-read `getTools()` and which tools are on screen. */
  refreshTools(): void;
  /** Run a tool as the agent would (cursor and all). Resolves with the finished record; never rejects. */
  runTool(name: string, args?: Record<string, unknown>): Promise<CallRecord>;
  /** Cancel a running or waiting call. Only works where `canCancel`. */
  cancel(id: string): void;
  clearCalls(): void;
  /** Scroll the tool's element into view and flash it. False when it isn't on screen. */
  locate(name: string): boolean;
  setSetting<K extends keyof DevtoolsSettings>(key: K, value: DevtoolsSettings[K]): void;
  /** Dock position and size back to defaults. */
  resetLayout(): void;
  /** Show (and copy) values as they were. Does nothing outside a development build. */
  setRevealed(on: boolean): void;
  /** A call's values before redaction; `undefined` outside a development build or once the call left the timeline. */
  raw(id: string): RawCall | undefined;
  /** `args` of `tool` as the panel shows and copies them: redacted, unless `revealed`. */
  shown(tool: string, args: unknown): unknown;
  /** Stop listening, restore `window.agent`. Calls in flight still settle. Idempotent. */
  destroy(): void;
}

declare const process: { env: { NODE_ENV?: string } };

/**
 * A development build. Literally `process.env.NODE_ENV`: the app's bundler replaces it (this package builds with the
 * neutral platform so the expression survives). Without a bundler there is no `process`: not development. Vitest's
 * "test" counts as development.
 */
function development(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

/** Settings before anything is passed or saved. */
export const DEFAULT_SETTINGS: DevtoolsSettings = {
  open: false,
  tab: "tools",
  dock: "bottom",
  size: 320,
  spotlight: false,
  yieldToUser: true,
};

const LOCATE_ATTR = "data-web-agents-locate";
const LOCATE_MS = 900;
const LOCATE_CSS = `
[${LOCATE_ATTR}] { outline: 2px solid var(--agent, #111); outline-offset: 3px; animation: web-agents-locate ${LOCATE_MS}ms ease-out; }
@keyframes web-agents-locate { from { outline-offset: 10px; } }
@media (prefers-reduced-motion: reduce) { [${LOCATE_ATTR}] { animation: none; } }`;

/** Core's inspection; a page whose tools come from another copy of core (or none) simply has none. */
const inspect = (): ToolInspection[] => {
  try {
    return inspectTools();
  } catch {
    return [];
  }
};

/** Still running, or waiting for the user's click. */
export const isOpen = (c: CallRecord): boolean => c.status === "running" || c.status === "waiting";

/** Drop undefined entries, so `{ spotlight: undefined }` doesn't override a default. */
const definedOnly = <T extends object>(obj: T | undefined): Partial<T> =>
  Object.fromEntries(Object.entries(obj ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;

function readSaved(key: string): Partial<DevtoolsSettings> {
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" ? (value as Partial<DevtoolsSettings>) : {};
  } catch {
    return {}; // storage blocked (private mode, sandboxed iframe) or garbage
  }
}

/**
 * Start collecting tools and calls for the devtools (and set `window.agent`).
 * Without `document` (SSR) it is an inert store. Call `destroy()` when done.
 */
export function createDevtoolsStore({
  visuals = null,
  storageKey = "web-agents-devtools",
  maxCalls = 200,
  initialSettings,
  now = Date.now,
}: DevtoolsStoreOptions = {}): DevtoolsStore {
  // Bound once the page has it: the store may start before the polyfill that `createWebAgents` loads.
  let mc = typeof document === "undefined" ? undefined : document.modelContext;
  const saved = typeof document === "undefined" ? {} : readSaved(storageKey);
  let state: DevtoolsState = {
    tools: [],
    calls: [],
    markers: [],
    settings: { ...DEFAULT_SETTINGS, ...definedOnly(initialSettings), ...saved },
    supported: !!mc,
    canCancel: !!mc?.cancelTool,
    hasVisuals: !!visuals,
    canReveal: development(),
    revealed: false,
  };
  const listeners = new Set<() => void>();
  const lifetime = new AbortController();
  let destroyed = false;
  let seq = 0;
  const nextId = (prefix: string): string => `${prefix}${++seq}`;

  const set = (patch: Partial<DevtoolsState>): void => {
    state = { ...state, ...patch };
    if (!destroyed) for (const listener of listeners) listener();
  };

  // ---------- 1. settings ----------
  // Only what the user saved is applied to the cursor; otherwise the app's own visuals options stand.
  // On a later task: a React host is created in a child effect, and the provider's effect that
  // applies its own `spotlight` prop runs after it in the same commit.
  const applySaved = setTimeout(() => {
    if (saved.spotlight !== undefined) visuals?.setSpotlight(saved.spotlight);
    if (saved.yieldToUser !== undefined) visuals?.setYieldToUser(saved.yieldToUser);
  }, 0);

  function setSetting<K extends keyof DevtoolsSettings>(key: K, value: DevtoolsSettings[K]): void {
    if (state.settings[key] === value) return;
    saved[key] = value;
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      /* not persisted; still applied */
    }
    if (key === "spotlight") visuals?.setSpotlight(value as boolean);
    if (key === "yieldToUser") visuals?.setYieldToUser(value as boolean);
    set({ settings: { ...state.settings, [key]: value } });
  }

  function resetLayout(): void {
    for (const key of ["dock", "size"] as const) setSetting(key, DEFAULT_SETTINGS[key]);
  }

  // ---------- 2. tools ----------
  let refreshQueued = false;
  let refreshSeq = 0;
  function refreshTools(): void {
    const context = mc;
    if (!context || refreshQueued || destroyed) return;
    // Coalesce: one React commit can register and unregister many tools.
    refreshQueued = true;
    queueMicrotask(async () => {
      refreshQueued = false;
      const mine = ++refreshSeq;
      const infos = await context.getTools().catch(() => []);
      if (mine !== refreshSeq || destroyed) return; // a newer refresh is on its way
      // One pass over the page instead of two queries per tool. A form wins over other elements of the same name.
      const elements = new Map<string, Element>();
      for (const el of document.querySelectorAll("[toolname]")) {
        const name = el.getAttribute("toolname") ?? "";
        if (!elements.has(name) || el instanceof HTMLFormElement) elements.set(name, el);
      }
      // WebTools, found the way the cursor finds their controls; catalog tools that are off here too
      const inspected = new Map(inspect().map((t) => [t.tool.id, t]));
      const view = (info: ModelContextToolInfo, registered: boolean): ToolView => {
        const el = elements.get(info.name);
        const form = el instanceof HTMLFormElement ? el : null;
        const web = form ? undefined : inspected.get(info.name);
        const annotations = (registered ? info.annotations : undefined) ?? (web ? hintsOf(web.tool) : {});
        const control = web && controlView(web);
        return {
          name: info.name,
          title: info.title,
          description: info.description ?? "",
          schema: parseSchema(info.inputSchema),
          annotations,
          kind: form ? "declarative" : "imperative",
          onScreen: control ? control.count > 0 : !!el,
          confirms: form ? !form.hasAttribute("toolautosubmit") : !!web?.tool.requireConfirmation,
          registered,
          ...(control && { control, fields: fieldViews(web.fields) }),
          ...(web?.tool.match !== undefined && { match: matchText(web.tool.match) }),
          fits: web?.fits ?? true,
          flags: flagViews(annotations),
        };
      };
      const listed = new Set(infos.map((info) => info.name));
      const tools = [
        ...infos.map((info) => view(info, true)),
        ...[...inspected.values()]
          .filter(({ tool }) => !listed.has(tool.id))
          .map(({ tool }) =>
            view({ name: tool.id, title: tool.title, description: tool.description, inputSchema: tool.jsonSchema }, false),
          ),
      ].sort((a, b) => a.name.localeCompare(b.name));
      // the page changes often (see below): only a real difference is a new snapshot
      if (JSON.stringify(tools) !== JSON.stringify(state.tools)) set({ tools });
    });
  }
  // What the cursor would find changes with the page, not only with the tools: the URL (`match`), and the controls
  // rendered (a button appears, a label changes). Attribute changes are limited to what naming and visibility read;
  // `style` and `class` move with every animation frame of the cursor.
  let offPath = (): void => {};
  let mutated = 0;
  const observer =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          clearTimeout(mutated);
          mutated = window.setTimeout(refreshTools, 250);
        })
      : null;
  const stopWaiting = whenModelContext((found) => {
    if (destroyed) return;
    mc = found;
    if (!state.supported) set({ supported: true, canCancel: !!found.cancelTool });
    found.addEventListener("toolchange", refreshTools, { signal: lifetime.signal });
    offPath = watchPathname(refreshTools);
    observeTools();
    refreshTools();
  });
  function observeTools(): void {
    observer?.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributeFilter: [
        "aria-label",
        "aria-labelledby",
        "aria-hidden",
        "aria-disabled",
        "disabled",
        "hidden",
        "inert",
        "role",
        "toolname",
        "name",
        "title",
        "placeholder",
        "href",
      ],
    });
  }

  // ---------- 3. calls ----------
  /** The values as they were, by call id: development only, pruned with the timeline. */
  const raws = state.canReveal ? new Map<string, RawCall>() : undefined;
  const keepRaw = (id: string, values: Partial<RawCall>): void => {
    raws?.set(id, { fills: [], ...raws.get(id), ...values });
  };
  /**
   * The page's redactor, read at each record (a later `configureRedaction` applies to the next call), with the tool's
   * own `sensitive` fields. A redactor that fails leaves the token, never the value.
   */
  const redactorFor = (tool: string) => {
    const redact = getRedactor();
    const marked = toolSensitivity(getRegisteredWebTool(tool));
    return {
      input: (value: unknown) => redact(value, { kind: "tool-input", tool, sensitive: marked.input }),
      output: (value: ModelContextToolResult) => redact(value, { kind: "tool-output", tool, sensitive: marked.output }),
      fill: (field: string, value: string | boolean) =>
        redact({ [field]: value }, { kind: "fill", tool, sensitive: marked.input })[field] as string | boolean,
      error: (text: string) => redact.text(text),
      // a gate's prompt can quote what the agent typed (a confirm-gated form's values): the same scan as the chat's
      prompt: (text: string) => redact.text(text),
    };
  };
  const push = (call: CallRecord, raw?: RawCall): CallRecord => {
    set({ calls: [call, ...state.calls].slice(0, maxCalls) });
    if (raws) {
      if (raw) raws.set(call.id, raw);
      for (const id of raws.keys()) if (!state.calls.some((c) => c.id === id)) raws.delete(id);
    }
    return call;
  };
  const patch = (id: string, change: Partial<CallRecord> | ((c: CallRecord) => Partial<CallRecord>)): void => {
    const i = state.calls.findIndex((c) => c.id === id);
    const c = state.calls[i];
    if (!c) return;
    set({ calls: state.calls.with(i, { ...c, ...(typeof change === "function" ? change(c) : change) }) });
  };
  const latestOpen = (tool: string): CallRecord | undefined => state.calls.find((c) => c.tool === tool && isOpen(c));
  const agentCall = (tool: string, startedAt = now(), args?: unknown): CallRecord =>
    push(
      {
        id: nextId("c"),
        tool,
        origin: "agent",
        args: args === undefined ? undefined : redactorFor(tool).input(args),
        fills: [],
        status: "running",
        startedAt,
      },
      { args, fills: [] },
    );

  /** Devtools calls whose `start` event hasn't arrived yet: that event is theirs, not a new agent call. */
  const awaitingStart = new Map<string, string>();
  const aborts = new Map<string, AbortController>();

  /** A run from the panel or `window.agent`: the finished record, and the result as the tool gave it. */
  async function run(name: string, args: Record<string, unknown> = {}): Promise<{ record: CallRecord; raw?: ModelContextToolResult }> {
    const call = push(
      {
        id: nextId("c"),
        tool: name,
        origin: "devtools",
        args: redactorFor(name).input(args),
        fills: [],
        status: "running",
        startedAt: now(),
      },
      { args, fills: [] },
    );
    const controller = new AbortController();
    aborts.set(call.id, controller);
    // Before executeTool: the polyfill announces the tool (→ `start`) inside the call.
    awaitingStart.set(name, call.id);
    let outcome: Partial<CallRecord>;
    /** What `window.agent.invoke` resolves with: the developer's own call, so the result as the tool gave it. */
    let raw: ModelContextToolResult | undefined;
    try {
      const result = (await executeTool(name, args, { signal: controller.signal })) ?? NAVIGATED;
      raw = result;
      outcome = { status: isFailure(result) ? "error" : "ok", result };
    } catch (err) {
      outcome = isAbortError(err) ? { status: "cancelled" } : { status: "error", error: errorText(err) };
    } finally {
      aborts.delete(call.id);
      if (awaitingStart.get(name) === call.id) awaitingStart.delete(name);
    }
    keepRaw(call.id, { result: outcome.result, error: outcome.error });
    const redact = redactorFor(name);
    if (outcome.result) outcome.result = redact.output(outcome.result);
    if (outcome.error) outcome.error = redact.error(outcome.error);
    outcome = { ...outcome, endedAt: now(), prompt: undefined };
    patch(call.id, outcome);
    // The record may have dropped off the timeline already (cap, Clear).
    return { record: state.calls.find((c) => c.id === call.id) ?? { ...call, ...outcome }, raw };
  }
  const runTool = (name: string, args?: Record<string, unknown>): Promise<CallRecord> => run(name, args).then((r) => r.record);

  function onEvent(e: AgentEvent): void {
    switch (e.type) {
      case "start":
        if (awaitingStart.has(e.tool)) awaitingStart.delete(e.tool);
        else agentCall(e.tool, now(), e.args);
        return;
      case "fill": {
        const call = latestOpen(e.tool) ?? agentCall(e.tool);
        const at = now();
        const value = redactorFor(e.tool).fill(e.field, e.value);
        keepRaw(call.id, { fills: [...(raws?.get(call.id)?.fills ?? []), { field: e.field, value: e.value, at }] });
        patch(call.id, (c) => ({ fills: [...c.fills, { field: e.field, value, at }] }));
        return;
      }
      case "park": {
        const call = latestOpen(e.tool) ?? agentCall(e.tool);
        keepRaw(call.id, { prompt: e.prompt });
        patch(call.id, { status: "waiting", prompt: redactorFor(e.tool).prompt(e.prompt) });
        return;
      }
      case "result":
      case "error": {
        const endedAt = now();
        // Native Chrome can submit an autosubmit form without announcing it first: the result is the first signal.
        const call = latestOpen(e.tool) ?? agentCall(e.tool, endedAt - e.ms);
        if (call.origin === "devtools") return; // settled by runTool, with the full result
        const redact = redactorFor(e.tool);
        if (e.type === "error") {
          keepRaw(call.id, { error: e.error });
          patch(call.id, { status: "error", error: redact.error(e.error), endedAt, prompt: undefined });
        } else {
          const result = toToolResult(e.result);
          keepRaw(call.id, { result });
          patch(call.id, { status: isFailure(result) ? "error" : "ok", result: redact.output(result), endedAt, prompt: undefined });
        }
        return;
      }
      case "cancel": {
        const call = latestOpen(e.tool);
        if (call) patch(call.id, { status: "cancelled", endedAt: now(), prompt: undefined });
        return;
      }
      case "yield":
      case "resume": {
        const marker: TimelineMarker = { id: nextId("m"), type: e.type, at: now() };
        if (e.type === "yield") marker.reason = e.reason;
        set({ markers: [marker, ...state.markers].slice(0, maxCalls) });
        return;
      }
    }
  }
  const offEvents = onAgentEvent(onEvent);

  function cancel(id: string): void {
    const call = state.calls.find((c) => c.id === id);
    if (!call || !isOpen(call)) return;
    const controller = aborts.get(id);
    if (controller)
      controller.abort(); // the browser cancels through executeTool's signal
    else mc?.cancelTool?.(call.tool);
  }

  // ---------- 4. locate ----------
  let locateTimer = 0;
  let located: Element | null = null;
  let style: HTMLStyleElement | null = null;
  function locate(name: string): boolean {
    // what the cursor would act on (core's resolver), else the tool's form or `toolname` element
    const el = inspect().find((t) => t.tool.id === name)?.controls[0] ?? document.querySelector(`[toolname="${CSS.escape(name)}"]`);
    if (!el) return false;
    if (!style) {
      style = document.createElement("style");
      style.textContent = LOCATE_CSS;
      document.head.append(style);
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    located?.removeAttribute(LOCATE_ATTR);
    clearTimeout(locateTimer);
    el.setAttribute(LOCATE_ATTR, "");
    located = el;
    locateTimer = window.setTimeout(() => {
      el.removeAttribute(LOCATE_ATTR);
      located = null;
    }, LOCATE_MS);
    return true;
  }

  // ---------- 5. window.agent (the README's console helper) ----------
  const previousAgent = typeof window === "undefined" ? undefined : window.agent;
  // the developer's own call: it resolves with the result as the tool gave it (the timeline shows it redacted)
  const invoke = (name: string, args?: Record<string, unknown>) => run(name, args).then((r) => r.raw);
  const agentApi: NonNullable<Window["agent"]> = {
    invoke,
    run: invoke,
    list: async () => (mc ? mc.getTools() : []),
  };
  if (typeof window !== "undefined") window.agent = agentApi;

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refreshTools,
    runTool,
    cancel,
    clearCalls() {
      set({ calls: state.calls.filter(isOpen), markers: [] });
      if (raws) for (const id of raws.keys()) if (!state.calls.some((c) => c.id === id)) raws.delete(id);
    },
    locate,
    setSetting,
    resetLayout,
    setRevealed(on) {
      if (state.canReveal && state.revealed !== on) set({ revealed: on });
    },
    raw: (id) => raws?.get(id),
    shown: (tool, args) => (state.revealed ? args : redactorFor(tool).input(args)),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      lifetime.abort();
      offEvents();
      stopWaiting();
      offPath();
      observer?.disconnect();
      clearTimeout(mutated);
      clearTimeout(applySaved);
      clearTimeout(locateTimer);
      located?.removeAttribute(LOCATE_ATTR);
      style?.remove();
      if (typeof window !== "undefined" && window.agent === agentApi) window.agent = previousAgent;
    },
  };
}
