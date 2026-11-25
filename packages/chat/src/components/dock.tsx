/**
 * The docked layout: the panel sits at the side of the page and the page makes room for it (the body gets a margin),
 * instead of floating over what the agent is working on. Its width is the person's to choose, by dragging the inner
 * edge or with the arrow keys, and is remembered. On narrow screens the panel is a bottom sheet and nothing docks.
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useState } from "react";
import { useChatContext, usePart } from "../customize/context";

const WIDTH_KEY = "web-agents:chat:width";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 320;
/** Below this the panel is a bottom sheet (see chat.css). */
export const DOCK_QUERY = "(min-width: 640px)";

/** Never wider than leaves the page 360 px (and never over 720). */
const maxWidth = (): number => Math.max(MIN_WIDTH, Math.min(720, (typeof window === "undefined" ? 1280 : window.innerWidth) - 360));
const clamp = (w: number): number => Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, w)));

/** The width the person chose last time, or `undefined`. */
function savedWidth(): number | undefined {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(w) && w > 0 ? clamp(w) : undefined;
  } catch {
    return undefined;
  }
}

/** The theme's first docked width (`--wa-chat-size-dock-width`, in px), or `undefined` when unset or not in px. */
function themedWidth(host: HTMLElement | null): number | undefined {
  if (!host || typeof getComputedStyle === "undefined") return undefined;
  const value = getComputedStyle(host).getPropertyValue("--wa-chat--size-dock-width").trim();
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value);
  return px ? clamp(Number(px[1])) : undefined;
}

export type DockSide = "left" | "right";

/**
 * The panel's width, and while `docked` (open) on a wide screen the page's margin on `side` (the physical side: the
 * chat's direction is already applied). `active` says whether the panel is docked right now (false on a phone, where
 * it's a bottom sheet). With no saved width, the first width is the theme's `size.dockWidth` (380 px by default).
 */
export function useDock(
  docked: boolean,
  side: DockSide,
  host: HTMLElement | null = null,
): { active: boolean; width: number; setWidth(w: number): void } {
  const [width, setWidthState] = useState(() => savedWidth() ?? DEFAULT_WIDTH);
  useEffect(() => {
    if (savedWidth() !== undefined) return;
    const themed = themedWidth(host);
    if (themed !== undefined) setWidthState(themed);
  }, [host]);
  const [wide, setWide] = useState(() => typeof window !== "undefined" && matchMedia(DOCK_QUERY).matches);

  // A narrower window shrinks the panel too, so the page keeps its 360 px.
  useEffect(() => {
    const list = matchMedia(DOCK_QUERY);
    const onChange = (): void => setWide(list.matches);
    const onResize = (): void => setWidthState((w) => clamp(w));
    list.addEventListener("change", onChange);
    window.addEventListener("resize", onResize);
    return () => {
      list.removeEventListener("change", onChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // The page makes room: the body gets a margin, and `--wa-chat-inset-left|right` (0.4.0) and
  // `--wa-chat-space-inset-left|right` tell other fixed UI (a drawer, the devtools) to keep clear of that side.
  useEffect(() => {
    if (!docked || !wide) return;
    const root = document.documentElement;
    const names = [`--wa-chat-inset-${side}`, `--wa-chat-space-inset-${side}`];
    root.dataset.waChatDock = side;
    for (const name of names) root.style.setProperty(name, `${width}px`);
    return () => {
      delete root.dataset.waChatDock;
      for (const name of names) root.style.removeProperty(name);
    };
  }, [docked, wide, side, width]);

  const setWidth = (w: number): void => {
    const next = clamp(w);
    setWidthState(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // only a preference
    }
  };
  return { active: docked && wide, width, setWidth };
}

/** The panel's inner edge: drag it, or focus it and use the arrow keys (Shift for bigger steps). */
export function ResizeHandle({ side, width, onResize }: { side: DockSide; width: number; onResize(w: number): void }) {
  const { t } = useChatContext();
  const part = usePart();
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent): void => onResize(side === "right" ? window.innerWidth - ev.clientX : ev.clientX);
    const up = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.documentElement.removeAttribute("data-wa-chat-resizing");
    };
    document.documentElement.setAttribute("data-wa-chat-resizing", "");
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 64 : 16;
    // the arrow that points away from the page's edge widens the panel
    const grow = side === "right" ? "ArrowLeft" : "ArrowRight";
    const shrink = side === "right" ? "ArrowRight" : "ArrowLeft";
    if (e.key === grow) onResize(width + step);
    else if (e.key === shrink) onResize(width - step);
    else if (e.key === "Home") onResize(MIN_WIDTH);
    else if (e.key === "End") onResize(maxWidth());
    else return;
    e.preventDefault();
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable window splitter (WAI-ARIA separator); <hr> can't take focus or keys
    <div
      {...part("resizer", "wa-chat__resize")}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("resize")}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={maxWidth()}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
