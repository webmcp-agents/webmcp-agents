/**
 * The devtools panel: Tools · Timeline · Settings tabs, a launcher button when
 * closed, docked to the bottom or right and resizable. `embedded` drops the
 * launcher, dock and resize and fills its container (the TanStack Devtools tab).
 */
import { UI_HOST_ATTR } from "@webmcp-agents/core";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { coerce } from "../schema-form/coerce";
import { type CallRecord, type DevtoolsStore, type DevtoolsTab, isOpen } from "../store";
import { CloseIcon, CursorIcon, DockBottomIcon, DockRightIcon } from "./icons";
import { Settings } from "./settings";
import { Timeline } from "./timeline";
import { type RunnerTarget, ToolList } from "./tool-list";
import { useDevtools } from "./use-devtools";

/** Toggles the floating panel. */
export const DEFAULT_HOTKEY = "Alt+Shift+A";

/** Props of `Panel`. */
export interface PanelProps {
  store: DevtoolsStore;
  /** Fill the container; no launcher, dock or resize handle. */
  embedded?: boolean;
  /** Toggles the panel, e.g. "Alt+Shift+A" (the default). False turns it off. */
  hotkey?: string | false;
}

const TABS: Array<{ id: DevtoolsTab; label: string }> = [
  { id: "tools", label: "Tools" },
  { id: "timeline", label: "Timeline" },
  { id: "settings", label: "Settings" },
];
const MIN_SIZE = 240;
const RESIZE_STEP = 16;

/** "Alt+Shift+A" → a matcher. Letters and digits match by physical key, so Option on a Mac doesn't change them. */
function hotkeyMatcher(hotkey: string): (e: globalThis.KeyboardEvent) => boolean {
  const parts = hotkey.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.at(-1) ?? "";
  const mods = { alt: parts.includes("alt"), shift: parts.includes("shift"), ctrl: parts.includes("ctrl"), meta: parts.includes("meta") };
  const code = /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : null;
  return (e) =>
    e.altKey === mods.alt &&
    e.shiftKey === mods.shift &&
    e.ctrlKey === mods.ctrl &&
    e.metaKey === mods.meta &&
    (code ? e.code === code : e.key.toLowerCase() === key);
}

/** A redacted value's token, index token (`[EMAIL_1]`) or mask (`42••••42`, `••••`). A custom `token` is not known here. */
const MASKED = /\[[A-Z0-9_]+\]|•/;

/** `value` with every string that carries a redaction token or mask blanked, so a re-run asks for it again. */
function unmasked<T>(value: T): T {
  if (typeof value === "string") return (MASKED.test(value) ? "" : value) as T;
  if (Array.isArray(value)) return value.map(unmasked) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unmasked(v)])) as T;
}

const isEditable = (target: EventTarget | undefined): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));

/** The whole devtools UI for one store. Render it inside a `ShadowHost` (its styles live there). */
export function Panel({ store, embedded = false, hotkey = DEFAULT_HOTKEY }: PanelProps) {
  const settings = useDevtools(store, (s) => s.settings);
  // Numbers, not the calls array: the panel re-renders when a count changes, not on every fill.
  const callCount = useDevtools(store, (s) => s.calls.length);
  const running = useDevtools(store, (s) => s.calls.filter(isOpen).length);
  const open = embedded || settings.open;
  const { tab, dock } = settings;
  const [runner, setRunner] = useState<RunnerTarget | null>(null);
  const [dragSize, setDragSize] = useState<number | null>(null);
  const tabRefs = useRef<Partial<Record<DevtoolsTab, HTMLButtonElement | null>>>({});
  const launcher = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const id = useId();

  const setOpen = (next: boolean) => {
    moveFocus.current = true;
    store.setSetting("open", next);
  };

  // Opening by hand lands on the active tab; closing returns to the launcher.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    if (open) tabRefs.current[tab]?.focus();
    else launcher.current?.focus();
  }, [open, tab]);

  // Which tools are on screen changes without a toolchange: re-check when the list is shown.
  useEffect(() => {
    if (open && tab === "tools") store.refreshTools();
  }, [store, open, tab]);

  useEffect(() => {
    if (!hotkey || embedded) return;
    const matches = hotkeyMatcher(hotkey);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!matches(e)) return;
      // Typing in the page's own fields: leave the keystroke to the page.
      const path = e.composedPath();
      if (isEditable(path[0]) && !path.some((n) => n instanceof Element && n.hasAttribute(UI_HOST_ATTR))) return;
      e.preventDefault();
      moveFocus.current = true;
      store.setSetting("open", !store.getSnapshot().settings.open);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [store, hotkey, embedded]);

  const selectTab = (next: DevtoolsTab, focus = false) => {
    store.setSetting("tab", next);
    if (focus) tabRefs.current[next]?.focus();
  };
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = TABS[(to + TABS.length) % TABS.length];
    if (next) selectTab(next.id, true);
  };

  // Stable, so memoised timeline rows don't re-render for it.
  const onRerun = useCallback(
    (recorded: CallRecord) => {
      // The values as they were (development builds); otherwise the redacted ones, with each masked value left blank:
      // a run must never send "[REDACTED]" or "••••" to the tool as if it were the value.
      const raw = store.raw(recorded.id);
      const call = raw ? { ...recorded, ...raw } : { ...recorded, args: unmasked(recorded.args), fills: unmasked(recorded.fills) };
      let args = call.args;
      if (args === undefined) {
        // A declarative form run by an agent: rebuild its arguments from the fields it typed.
        const props = store.getSnapshot().tools.find((t) => t.name === call.tool)?.schema.properties ?? {};
        args = Object.fromEntries(
          call.fills.map((f) => {
            const prop = props[f.field];
            return [f.field, typeof f.value === "string" && prop ? (coerce(prop, f.value) ?? "") : f.value];
          }),
        );
      }
      setRunner({ tool: call.tool, args, key: Date.now() });
      store.setSetting("tab", "tools");
    },
    [store],
  );

  // ---------- resize ----------
  const viewport = () => (dock === "bottom" ? innerHeight : innerWidth);
  const clamp = (size: number) => Math.round(Math.min(Math.max(MIN_SIZE, size), viewport() * 0.8));
  const size = clamp(dragSize ?? settings.size);
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setDragSize(clamp(dock === "bottom" ? innerHeight - e.clientY : innerWidth - e.clientX));
  };
  const onResizeEnd = () => {
    if (dragSize !== null) store.setSetting("size", dragSize);
    setDragSize(null);
  };
  const onResizeKey = (e: KeyboardEvent) => {
    const grow = dock === "bottom" ? { ArrowUp: 1, ArrowDown: -1 } : { ArrowLeft: 1, ArrowRight: -1 };
    const dir = grow[e.key as keyof typeof grow];
    if (!dir) return;
    e.preventDefault();
    store.setSetting("size", clamp(size + dir * RESIZE_STEP));
  };

  if (!open) {
    return (
      <button
        ref={launcher}
        type="button"
        className="launcher"
        aria-label={`Open Web Agents devtools${running ? ` (${running} running)` : ""}`}
        aria-expanded={false}
        title={hotkey ? `Web Agents devtools (${hotkey})` : "Web Agents devtools"}
        onClick={() => setOpen(true)}
      >
        <CursorIcon />
        {running > 0 && <span className="dot" />}
      </button>
    );
  }

  return (
    <section
      className="panel"
      role="dialog"
      aria-label="Web Agents devtools"
      data-dock={dock}
      data-embedded={embedded || undefined}
      style={embedded ? undefined : dock === "bottom" ? { height: size } : { width: size }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !embedded && !e.defaultPrevented) {
          e.preventDefault();
          setOpen(false);
        }
      }}
    >
      {!embedded && (
        // biome-ignore lint/a11y/useSemanticElements: a focusable window splitter (ARIA separator pattern); <hr> can't take focus or pointer drags
        <div
          className="resize"
          role="separator"
          tabIndex={0}
          aria-label="Resize devtools"
          aria-orientation={dock === "bottom" ? "horizontal" : "vertical"}
          aria-valuenow={size}
          aria-valuemin={MIN_SIZE}
          aria-valuemax={Math.round(viewport() * 0.8)}
          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onKeyDown={onResizeKey}
        />
      )}
      <header className="bar">
        <span className="brand">
          <CursorIcon />
          Web Agents
        </span>
        <div className="tabs" role="tablist" aria-label="Devtools sections" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              className="tab"
              id={`${id}-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
              {t.id === "timeline" && callCount > 0 && (
                <span className={`count${running ? " live" : ""}`} title={running ? `${running} running` : undefined}>
                  {running || callCount}
                </span>
              )}
            </button>
          ))}
        </div>
        {!embedded && (
          <div className="actions">
            <button
              type="button"
              className="btn icon ghost"
              aria-label={dock === "bottom" ? "Dock to the right" : "Dock to the bottom"}
              title={dock === "bottom" ? "Dock to the right" : "Dock to the bottom"}
              onClick={() => store.setSetting("dock", dock === "bottom" ? "right" : "bottom")}
            >
              {dock === "bottom" ? <DockRightIcon /> : <DockBottomIcon />}
            </button>
            <button type="button" className="btn icon ghost" aria-label="Close devtools" title="Close (Esc)" onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </div>
        )}
      </header>
      <div className="body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
        {tab === "tools" && <ToolList store={store} runner={runner} onRunner={setRunner} />}
        {tab === "timeline" && <Timeline store={store} onRerun={onRerun} />}
        {tab === "settings" && <Settings store={store} embedded={embedded} hotkey={hotkey} />}
      </div>
    </section>
  );
}
