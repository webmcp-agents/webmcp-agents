/**
 * Notices a real person using the page, so the agent's cursor can get out of
 * the way (issue: "when a user interacts, the agent cursor should hide").
 *
 * Only trusted input counts: the visual layer and the polyfill fill fields
 * with synthetic `input` / `change` events, which must never look like a user.
 */
import type { Vec } from "./motion";

export interface YieldOptions {
  /**
   * Pointer travel (px, within 150 ms) that counts as the user interacting. Default: none, moving the pointer never
   * yields. A person who starts a call and moves the mouse off the button would otherwise never see the cursor, and a
   * moving pointer does not compete with it: a click, a scroll, a touch or a key does. Set a number (6 ignores sensor
   * jitter) for a cursor that hides the moment the pointer moves.
   */
  moveThreshold?: number;
  /** Quiet time (ms) after the user's last input before the cursor may appear again. Default 800. */
  resumeAfter?: number;
  /**
   * Input inside an element matching this selector never yields: the user is
   * driving the agent from there (devtools panel, chat widget). Default `[data-web-agents-ui]`.
   */
  ignore?: string;
}

export type YieldReason = "pointer" | "keyboard" | "wheel" | "touch";

/** Marks the host element of library UIs (devtools, chat). Input inside never makes the cursor yield. */
export const UI_HOST_ATTR = "data-web-agents-ui";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn"]);

/** Pointer travel only counts if it adds up within this window. */
const MOVE_WINDOW_MS = 150;

/**
 * Call `onInput` (at most once per frame) whenever the user interacts.
 * `at` is the pointer position in document px, or null for keyboard input.
 * Listeners are passive and removed when `signal` aborts.
 */
export function watchUserInput(
  onInput: (reason: YieldReason, at: Vec | null) => void,
  { moveThreshold = Infinity, ignore = `[${UI_HOST_ATTR}]` }: YieldOptions,
  signal: AbortSignal,
): void {
  let travelled = 0;
  let windowStart = 0;
  /** Last pointer position (client px); travel is measured from positions, not movementX/Y, which injected input may leave at 0. */
  let last: { x: number; y: number } | null = null;
  let queued: { reason: YieldReason; at: Vec | null } | null = null;
  let frame = 0;

  const fromUi = (e: Event): boolean => e.composedPath().some((n) => n instanceof Element && n.matches(ignore));

  const report = (reason: YieldReason, at: Vec | null): void => {
    queued = { reason, at };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (queued && !signal.aborted) onInput(queued.reason, queued.at);
      queued = null;
    });
  };

  const point = (e: { clientX: number; clientY: number }): Vec => ({ x: e.clientX + scrollX, y: e.clientY + scrollY });
  const options: AddEventListenerOptions = { capture: true, passive: true, signal };

  addEventListener(
    "pointermove",
    (e) => {
      if (!e.isTrusted || e.pointerType === "touch" || fromUi(e)) return;
      const now = e.timeStamp;
      if (now - windowStart > MOVE_WINDOW_MS) {
        windowStart = now;
        travelled = 0;
      }
      travelled += last ? Math.hypot(e.clientX - last.x, e.clientY - last.y) : Math.hypot(e.movementX, e.movementY);
      last = { x: e.clientX, y: e.clientY };
      if (travelled >= moveThreshold) report("pointer", point(e));
    },
    options,
  );
  addEventListener(
    "pointerdown",
    (e) => {
      if (e.isTrusted && !fromUi(e)) report(e.pointerType === "touch" ? "touch" : "pointer", point(e));
    },
    options,
  );
  addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      if (e.isTrusted && !fromUi(e)) report("touch", t ? point(t) : null);
    },
    options,
  );
  addEventListener(
    "wheel",
    (e) => {
      if (e.isTrusted && !fromUi(e)) report("wheel", point(e));
    },
    options,
  );
  addEventListener(
    "keydown",
    (e) => {
      if (!e.isTrusted || e.repeat || MODIFIER_KEYS.has(e.key) || fromUi(e)) return;
      report("keyboard", null);
    },
    options,
  );

  signal.addEventListener("abort", () => cancelAnimationFrame(frame), { once: true });
}
