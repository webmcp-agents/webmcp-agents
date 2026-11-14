/**
 * Ghost cursor. No knowledge of tools: just "go here", "click", "highlight
 * that", "wait for the user".
 *
 * Everything moves in one requestAnimationFrame loop, in DOCUMENT coordinates,
 * and is re-anchored to live element rects every frame. So the cursor stays
 * on its target while the page scrolls or the layout shifts, and a new
 * `moveTo` bends the current motion instead of restarting it.
 *
 * Looks: a multiplayer-style arrow with a name tag. At rest it rocks gently
 * left and right around its tip, so it reads as "alive and working" without
 * drifting off its target.
 */
import { type Vec, Spring, SpringSet, arcPoint, clamp, distance, minimumJerk, random, travelTime } from "./motion";
import { UI_HOST_ATTR } from "./user-yield";

interface Aim {
  el: Element;
  /** Smaller targets take longer to land on (Fitts's law). */
  size: number;
  /** Where on the element to point, from its live viewport rect. */
  point(rect: DOMRect): Vec;
}

interface Travel {
  from: Vec;
  bend: number;
  start: number;
  duration: number;
}

// Looked up on first use, so importing this module never touches the DOM (SSR-safe).
let reducedMotion: MediaQueryList | null | undefined;
export const reduced = (): boolean => {
  reducedMotion ??= typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  return reducedMotion?.matches ?? false;
};

/** Waits under way, so they can end the moment the person takes over. */
const waits = new Set<() => void>();
const endWaits = (): void => {
  for (const done of waits) done();
  waits.clear();
};

/**
 * setTimeout as a promise. Collapses to 0 when the user prefers reduced motion,
 * or while the cursor has yielded to the user (nothing is on screen to wait for);
 * one already under way ends when the cursor yields.
 */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    waits.add(resolve);
    setTimeout(
      () => {
        waits.delete(resolve);
        resolve();
      },
      reduced() || agentCursor.isYielded() ? 0 : ms,
    );
  });

/** Pixel inside the 24×24 cursor box that sits exactly on the target: the arrow's tip. */
const HOTSPOT: Vec = { x: 4, y: 4 };
const ARROW_PATH = "M5.1 3.4 20.2 9.5c.8.3.8 1.4 0 1.7l-6.3 2.5-2.5 6.3c-.3.8-1.4.8-1.7 0L3.4 5.1c-.3-.9.8-2 1.7-1.7z";

const CURSOR_HTML = `
  <span class="agent-cursor__halo"></span>
  <svg class="agent-cursor__arrow" width="24" height="24" viewBox="0 0 24 24"><path d="${ARROW_PATH}"/></svg>`;

/** Name tag offset from the tip. */
const TAG_OFFSET: Vec = { x: 20, y: 18 };

/** Rocking at rest: degrees around the tip, px sideways, cycles per second. */
const SWAY = { degrees: 9, px: 2.5, hz: 1.1 };

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);
const isTextField = (el: Element): boolean =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type));

/** Decide where to point. Small random offsets keep repeated moves from looking stamped. */
function aimAt(el: Element): Aim {
  const r = el.getBoundingClientRect();
  const size = Math.min(r.width, r.height);
  const jx = random(-0.12, 0.12);
  const jy = random(-0.15, 0.15);

  if (isTextField(el)) {
    // Over the text, where a caret would go.
    return {
      el,
      size: r.height,
      point: (b) => ({ x: b.left + Math.min(b.width - 12, 14 + b.width * (0.18 + jx)), y: b.top + b.height * 0.55 }),
    };
  }
  if (el instanceof HTMLFormElement || r.width > 280) {
    // Big container: hover near its leading edge, not dead centre.
    return { el, size, point: (b) => ({ x: b.left + Math.min(b.width / 2, 120), y: b.top + b.height / 2 }) };
  }
  return { el, size, point: (b) => ({ x: b.left + b.width * (0.5 + jx), y: b.top + b.height * (0.55 + jy) }) };
}

const docRect = (el: Element, pad = 0) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX - pad, y: r.top + scrollY - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
};

/** True when `el` sits in a fixed or sticky box (a header, a drawer): scrolling the page brings it no nearer. */
function pinned(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) if (/fixed|sticky/.test(getComputedStyle(n).position)) return true;
  return false;
}

/**
 * Scroll `el` to the middle when it is outside the viewport or within 64 px of its edge. A box larger than the
 * viewport can never be shown whole: there, only the point the hand lands on has to be in view.
 */
function revealIfNeeded({ el, point }: Aim): void {
  const r = el.getBoundingClientRect();
  const p = point(r);
  const out = (margin: number): boolean => {
    const [top, bottom] = r.height > innerHeight - margin * 2 ? [p.y, p.y] : [r.top, r.bottom];
    const [left, right] = r.width > innerWidth ? [p.x, p.x] : [r.left, r.right];
    return top < margin || bottom > innerHeight - margin || left < 0 || right > innerWidth;
  };
  // A pinned control in view is as visible as it gets: centring it would only drag the page along under it.
  if (!out(64) || (!out(0) && pinned(el))) return;
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced() ? "auto" : "smooth" });
}

/** How long a move waits for its target to scroll into view before it lands anyway, in ms. */
const REVEAL_MS = 1600;
/** A move that no frame finished (a hidden pane draws none) lands by timer this long after it should have, in ms. */
const STALLED_MS = 2500;
/** How close to the viewport's edge the hand waits for a target that is outside it, in px. */
const EDGE = 24;
/** How often a resting hand checks that the control it pressed is still under it, in ms. */
const REST_CHECK_MS = 100;

/** How far down the press the click lands (the scale springs from 1 to 0.8), and how long it waits for that frame, in ms. */
const PRESS_AT = 0.83;
const PRESS_MS = 250;

/** True when `el` has a box: a `display: none` one reports the page's corner as its place. */
const hasBox = (el: Element): boolean => el.isConnected && !!el.getClientRects()[0];

const RING_PAD = 4;

/** Blur everything except the tool the cursor is working in. */
export interface SpotlightOptions {
  /** Blur radius for the rest of the page, px. Default 4. */
  blur?: number;
  /** Darkening over the rest of the page, 0–1. Default 0.08. */
  dim?: number;
  /** Clear space around the focused element, px. Default 12. */
  padding?: number;
}

const SPOTLIGHT_DEFAULTS: Required<SpotlightOptions> = { blur: 4, dim: 0.08, padding: 12 };

/** Rounded rectangle as an SVG path, for the hole in the spotlight. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

/** How often the spotlight re-finds in-place library UI hosts, in ms. */
const UI_HOSTS_REFRESH_MS = 250;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** `a` minus `b`, as up to four non-overlapping boxes (bands above and below, slices left and right). */
function subtractRect(a: Box, b: Box): Box[] {
  if (b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom) return [a];
  const out: Box[] = [];
  if (b.top > a.top) out.push({ left: a.left, top: a.top, right: a.right, bottom: b.top });
  if (b.bottom < a.bottom) out.push({ left: a.left, top: b.bottom, right: a.right, bottom: a.bottom });
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  if (b.left > a.left) out.push({ left: a.left, top, right: b.left, bottom });
  if (b.right < a.right) out.push({ left: b.right, top, right: a.right, bottom });
  return out;
}

class GhostCursor {
  // ---- DOM ----
  private cursorEl!: HTMLDivElement;
  private tagEl!: HTMLDivElement;
  private ringEl!: HTMLDivElement;
  private liveEl!: HTMLDivElement;
  private spotEl!: HTMLDivElement;
  private name = "";

  // ---- physics (document px) ----
  /** The hand: stiff and nearly critically damped, so it lands fast with a hint of overshoot. */
  private pos = new SpringSet({ x: 0, y: 0 }, 620, 44);
  /** The tag trails the hand on a slightly looser spring. */
  private tag = new SpringSet({ x: 0, y: 0 }, 360, 34);
  /** The focus ring glides between the elements it frames. */
  private ring = new SpringSet({ x: 0, y: 0, w: 0, h: 0 }, 360, 36);
  /** The spotlight's clear window: softer than the ring, so focus shifts feel calm. */
  private spot = new SpringSet({ x: 0, y: 0, w: 0, h: 0 }, 150, 24);
  private spotlight: Required<SpotlightOptions> | null = null;
  /** Viewport rects of in-place library UI (devtools, chat), cut out of the spotlight. Read in step, written in render. */
  private uiHoles: Box[] = [];
  private uiHosts: Element[] = [];
  private uiHostsAt = -Infinity;
  /** The last clip-path written, so a still spotlight costs no style work. */
  private spotClip = "";
  private spotTarget: Element | null = null;
  /** After a click the window stops following layout shifts until the next move. */
  private spotFrozen = false;
  private spotHiddenAt = 0;
  /** Lean into horizontal movement; bounce on press. */
  private tilt = new Spring(0, 220, 26);
  private scale = new Spring(1, 760, 30);
  /** 0 while travelling, 1 at rest (more while parked). Springs, so the rocking fades in and out. */
  private sway = new Spring(0, 60, 14);
  private swayPhase = 0;

  // ---- intent ----
  private aim: Aim | null = null;
  private lastGoal: Vec = { x: 0, y: 0 };
  private travel: Travel | null = null;
  /** Settles the move under way: true, or false when another move took the hand first. */
  private arrival: ((arrived: boolean) => void) | null = null;
  /** End the waits for the bottom of a press (see `click`); presses that overlap each wait for that frame. */
  private readonly presses = new Set<() => void>();
  private ringTarget: Element | null = null;
  /** Until when the current move waits for its target to scroll into view (see `REVEAL_MS`). */
  private revealBy = 0;
  /** The control the hand pressed and rests on, and whether a hit test found it there: once it is gone, so is the hand. */
  private rest: { el: Element; hit: boolean } | null = null;
  private restCheckedAt = 0;
  /** Set by `attach()` (installAgentVisuals); a detached cursor never builds DOM and fast-forwards everything. */
  private attached = false;
  private mounted = false;
  private visible = false;
  private parked = false;
  /** The user is interacting: show nothing and fast-forward every step (see `yield`). */
  private yielded = false;
  /** Where the user's pointer last was (document px), so the next appearance starts there. */
  private lastUserPoint: Vec | null = null;
  private hiddenAt = 0;
  private tagWidth = 0;

  // ---- loop ----
  private raf = 0;
  private lastFrame = 0;

  // =====================================================================
  // public API
  // =====================================================================

  /** The name shown in the cursor's tag; empty hides the tag. */
  setName(name: string): void {
    this.name = name;
    if (this.mounted && !this.parked) this.setTag(name);
  }

  private setTag(text: string): void {
    this.tagEl.textContent = text;
    this.tagWidth = this.tagEl.offsetWidth;
  }

  /** Turn the spotlight on (optionally with options) or off. Safe to call at any time. */
  setSpotlight(options: SpotlightOptions | boolean): void {
    this.spotlight = options === false ? null : { ...SPOTLIGHT_DEFAULTS, ...(options === true ? {} : options) };
    if (!this.mounted) return;
    this.applySpotlightStyle();
    if (!this.spotlight) {
      this.spotEl.classList.remove("is-visible");
      this.spotTarget = null;
    }
    this.kick();
  }

  /**
   * Glide to `el`. Resolves true on arrival, and false as soon as another move supersedes this one: the hand is
   * that move's now, so the caller must not press with it. A target outside the viewport is scrolled into view first
   * (`reveal: false` leaves the page alone), and the hand lands once it is there: it waits at the viewport's edge
   * meanwhile, so a press is never out of sight.
   */
  moveTo(el: Element, reveal = true): Promise<boolean> {
    // Yielded or detached: arrive at once and show nothing. Never scroll the page under a user who is interacting.
    // Same for an element with no box (display: none, e.g. a hidden form field): it would aim at the page's corner.
    if (!this.ensure() || this.away() || !hasBox(el)) {
      this.arrival?.(true);
      this.arrival = null;
      return Promise.resolve(true);
    }
    const aim = aimAt(el);
    if (reveal) revealIfNeeded(aim);
    this.rest = null;
    this.revealBy = performance.now() + REVEAL_MS;

    const goal = this.goalOf(aim);
    if (!this.visible) this.appear(goal);
    this.spotFrozen = false;

    const from = { x: this.pos.get("x"), y: this.pos.get("y") };
    const dist = distance(from, goal);
    this.aim = aim;
    this.travel =
      dist < 4 || reduced()
        ? null
        : {
            from,
            bend: (Math.random() < 0.5 ? -1 : 1) * random(0.05, 0.15),
            start: performance.now(),
            duration: travelTime(dist, aim.size),
          };

    this.arrival?.(false);
    return new Promise((resolve) => {
      this.arrival = resolve;
      this.kick();
      // No frame, no arrival: a pane that draws nothing must not hold a tool for ever.
      setTimeout(
        () => {
          if (this.arrival !== resolve) return;
          this.arrival = null;
          resolve(true);
        },
        (this.travel?.duration ?? 0) + STALLED_MS,
      );
    });
  }

  /** Status for assistive tech. Visibly, the tag shows the agent's name (if any) or a park prompt. */
  say(text: string): void {
    if (!this.ensure()) return;
    if (this.liveEl.textContent !== text) this.liveEl.textContent = text;
  }

  /**
   * Frame an element with the focus ring, or pass null to release it.
   * While yielded the ring stays hidden unless `force` (used for the confirm button).
   */
  highlight(el: Element | null, force = false): void {
    if (!this.ensure()) return;
    // no box (display: none): nothing to ring, and following it would drag the ring to the page's corner
    if (el && !hasBox(el)) el = null;
    if (el && this.yielded && !force) return;
    if (el === this.ringTarget) return;
    const previous = this.ringTarget;
    this.ringTarget = el;
    if (!el) {
      this.ringEl.classList.remove("is-visible");
      return;
    }

    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 6;
    this.ringEl.style.borderRadius = `${radius + RING_PAD}px`;
    const r = docRect(el, RING_PAD);

    // Glide from the previous element if it was close; otherwise lock on from slightly wider.
    const glide =
      previous?.isConnected &&
      distance({ x: this.ring.get("x"), y: this.ring.get("y") }, r) < 360 &&
      this.ringEl.classList.contains("is-visible");
    if (!glide || reduced()) {
      const grow = reduced() ? 0 : 8;
      this.ring.snap({ x: r.x - grow, y: r.y - grow, w: r.w + grow * 2, h: r.h + grow * 2 });
    }
    this.ringEl.classList.add("is-visible");
    this.kick();
  }

  /** A glow on the ring: "this value just changed". Doesn't block. */
  flash(): void {
    if (this.ringTarget) restartAnimation(this.ringEl, "is-flashing");
  }

  /**
   * Press feedback with a ripple. `onPress` runs at the bottom of the press,
   * which is where callers release whatever the click stands for, so the page
   * reacts in the same frame as the ripple.
   */
  async click(onPress?: () => void): Promise<void> {
    if (!this.ensure() || this.away()) {
      // Nothing on screen: the press happens now, so whatever it gates runs without delay. A control ringed with
      // `force` still glows for a moment, so a call made while the person was busy is not a silent one.
      if (this.mounted) {
        const marked = this.ringTarget;
        this.release(true);
        this.flash();
        if (marked) {
          // Gone at once from a control the press covered (a drawer opening over it): a ring drawn on top would lie.
          const drop = (always: boolean) => (): void => {
            if (this.ringTarget !== marked || this.parked) return;
            const r = marked.getBoundingClientRect();
            if (always || !marked.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) this.highlight(null);
          };
          setTimeout(drop(false), 120);
          setTimeout(drop(true), 700);
        }
      }
      onPress?.();
      return;
    }
    const aim = this.aim;
    this.scale.target = 0.8;
    this.kick();
    // The press lands in the frame that draws the hand at the bottom (`update` ends this wait), so the ripple and the
    // page's reaction are painted with it. The timer is for a pane that draws no frames.
    await new Promise<void>((resolve) => {
      const done = (): void => {
        this.presses.delete(done);
        resolve();
      };
      this.presses.add(done);
      void wait(PRESS_MS).then(done);
    });
    // Another call's move began meanwhile (or the layer was torn down): the hand is its now, this press only runs.
    // Hidden meanwhile: no ripple without a hand.
    if (this.mounted && this.visible && this.aim === aim) {
      this.ripple();
      // Let go BEFORE the page reacts: the click is done, so whatever moves next
      // (a row inserted above, a cart that empties) must not drag the cursor along.
      this.release();
      // ...and leave once the control is no longer under the hand (see `stillOn`): a drawer opened over it, the list shifted.
      if (aim) this.rest = { el: aim.el, hit: this.stillOn(aim.el, true) };
    }
    onPress?.();
    this.scale.target = 1;
    await wait(120);
  }

  /**
   * Stop tracking the current element: the hand stays where it is, the ring
   * fades and the spotlight window holds still, until the next moveTo.
   */
  release(keepRing = false): void {
    this.aim = null;
    this.travel = null;
    this.arrival?.(true);
    this.arrival = null;
    this.spotFrozen = true;
    if (!keepRing) this.highlight(null);
  }

  /**
   * Hover in place while the browser waits for the user to confirm. `prompt`
   * is shown beside the cursor for as long as it waits, since without it a
   * parked cursor just looks stuck.
   */
  park(prompt: string, el?: Element): void {
    if (!this.ensure()) return;
    this.parked = true;
    // The ring on the button the user must click survives a yield: it says where to confirm.
    if (el) this.highlight(el, true);
    this.say(prompt);
    this.setTag(prompt);
    for (const el of [this.cursorEl, this.tagEl, this.ringEl]) el.classList.add("is-waiting");
  }

  /** Stop waiting: the prompt and the ring on the button go. */
  unpark(): void {
    if (!this.parked) return;
    this.parked = false;
    this.highlight(null);
    this.setTag(this.name);
    for (const el of [this.cursorEl, this.tagEl, this.ringEl]) el.classList.remove("is-waiting");
  }

  async hide(): Promise<void> {
    if (!this.mounted) return;
    this.highlight(null);
    this.unpark();
    if (!this.visible) return;
    this.visible = false;
    this.rest = null;
    this.aim = null; // nothing to track, and a removed control must not be kept alive
    this.hiddenAt = performance.now();
    this.travel = null;
    this.arrival?.(true);
    this.arrival = null;
    this.cursorEl.classList.remove("is-visible");
    this.tagEl.classList.remove("is-visible");
    this.spotEl.classList.remove("is-visible");
    this.spotTarget = null;
    this.spotHiddenAt = performance.now();
    this.scale.target = 0.6;
    this.kick();
    await wait(220);
  }

  /**
   * The user is interacting: get out of the way now. The cursor, tag and spotlight
   * fade out fast and every pending step fast-forwards (moves arrive at once,
   * clicks press at once, waits collapse), so whatever the agent is doing finishes
   * without waiting for animations. A ring on a confirm button stays.
   * `at` is the user's pointer in document px, where the cursor reappears from.
   */
  yieldToUser(at: Vec | null): void {
    if (at) this.lastUserPoint = at;
    if (this.yielded) return;
    this.yielded = true;
    this.travel = null;
    this.aim = null;
    this.rest = null;
    this.arrival?.(true);
    this.arrival = null;
    endWaits();
    if (!this.mounted) return;
    if (!this.parked) this.highlight(null);
    this.cursorEl.classList.add("is-yielded");
    this.tagEl.classList.add("is-yielded");
    this.spotEl.classList.remove("is-visible");
    this.spotTarget = null;
    this.spotHiddenAt = performance.now();
    if (this.visible) {
      this.visible = false;
      this.hiddenAt = performance.now();
      this.cursorEl.classList.remove("is-visible");
      this.tagEl.classList.remove("is-visible");
    }
    this.kick();
  }

  /** The user has been quiet for a while: the next move may show the cursor again. */
  resume(): void {
    if (!this.yielded) return;
    this.yielded = false;
    if (!this.mounted) return;
    this.cursorEl.classList.remove("is-yielded");
    this.tagEl.classList.remove("is-yielded");
  }

  /** True while nothing should animate: the user is interacting, or the layer is not installed. */
  isYielded(): boolean {
    return !this.attached || this.away();
  }

  /** Nobody is watching: the user took over, or the tab is in the background (where no frame is drawn). */
  private away(): boolean {
    return this.yielded || document.hidden;
  }

  /** Called by installAgentVisuals: from now on the cursor may build its DOM and animate. */
  attach(): void {
    this.attached = true;
  }

  /** Remove everything from the page, reset and detach. `attach()` makes it usable again. */
  destroy(): void {
    this.attached = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.arrival?.(true);
    this.arrival = null;
    endWaits();
    this.aim = null;
    this.travel = null;
    this.ringTarget = null;
    this.spotTarget = null;
    this.rest = null;
    this.visible = false;
    this.parked = false;
    this.yielded = false;
    this.lastUserPoint = null;
    this.hiddenAt = 0;
    this.spotHiddenAt = 0;
    this.scale.snap(1); // a press cut short must not keep the next install's frames running
    if (!this.mounted) return;
    this.mounted = false;
    for (const el of [this.spotEl, this.ringEl, this.tagEl, this.cursorEl, this.liveEl]) el.remove();
    for (const el of document.querySelectorAll(".agent-ripple")) el.remove();
  }

  // =====================================================================
  // internals
  // =====================================================================

  /** Build the DOM on first use. False when detached: callers then skip all visual work. */
  private ensure(): boolean {
    if (this.mounted) {
      // A router that swaps the whole body (Astro's, Turbo) takes the layer with it: put it back.
      if (!this.cursorEl.isConnected) this.mount();
      return true;
    }
    if (!this.attached) return false;
    this.mounted = true;
    const div = (className: string): HTMLDivElement => Object.assign(document.createElement("div"), { className });

    this.cursorEl = div("agent-cursor");
    this.cursorEl.innerHTML = CURSOR_HTML;
    this.cursorEl.setAttribute("aria-hidden", "true");

    this.tagEl = div("agent-tag");
    this.tagEl.setAttribute("aria-hidden", "true");
    this.tagEl.textContent = this.name;

    this.ringEl = div("agent-ring");
    this.ringEl.setAttribute("aria-hidden", "true");
    this.ringEl.addEventListener("animationend", () => this.ringEl.classList.remove("is-flashing"));

    this.liveEl = div("agent-sr-only");
    this.liveEl.setAttribute("role", "status");

    this.spotEl = div("agent-spotlight");
    this.spotClip = "";
    this.spotEl.setAttribute("aria-hidden", "true");
    this.applySpotlightStyle();

    this.mount();
    this.tagWidth = this.tagEl.offsetWidth;
    return true;
  }

  private mount(): void {
    document.body.append(this.spotEl, this.ringEl, this.tagEl, this.cursorEl, this.liveEl);
  }

  private applySpotlightStyle(): void {
    const o = this.spotlight ?? SPOTLIGHT_DEFAULTS;
    this.spotEl.style.setProperty("--agent-spot-blur", `${o.blur}px`);
    this.spotEl.style.setProperty("--agent-spot-dim", String(o.dim));
  }

  /** First show: drift in from just below-right of the target, or resume from where we left off. */
  private appear(goal: Vec): void {
    const resumed = this.hiddenAt > 0 && performance.now() - this.hiddenAt < 1500;
    const fromUser = this.lastUserPoint;
    this.lastUserPoint = null;
    // After yielding, enter from where the user's pointer was: one continuous hand-off.
    // Always from inside the viewport: a target the page is still scrolling to is approached in sight.
    const start = this.inView(
      fromUser ?? (resumed ? { x: this.pos.get("x"), y: this.pos.get("y") } : { x: goal.x + random(40, 70), y: goal.y + random(40, 70) }),
      EDGE,
    );
    this.pos.snap(start);
    this.tag.snap(this.tagGoal(start));
    this.scale.snap(reduced() ? 1 : 0.6);
    this.scale.target = 1;
    this.visible = true;
    this.cursorEl.classList.add("is-visible");
    this.tagEl.classList.add("is-visible");
  }

  private goalOf(aim: Aim): Vec {
    if (!hasBox(aim.el)) return this.lastGoal; // re-rendered away or hidden: hold position
    const p = aim.point(aim.el.getBoundingClientRect());
    this.lastGoal = { x: p.x + scrollX, y: p.y + scrollY };
    return this.lastGoal;
  }

  /** `p` pulled inside the viewport (document px), `inset` px from its edges. */
  private inView(p: Vec, inset = 0): Vec {
    return {
      x: clamp(p.x, scrollX + inset, scrollX + innerWidth - inset),
      y: clamp(p.y, scrollY + inset, scrollY + innerHeight - inset),
    };
  }

  /**
   * True while the control the hand pressed is still under it: on the page, around the tip, and (`hit`) the
   * topmost thing there. False once a drawer covers it, it moved away or it was removed.
   */
  private stillOn(el: Element, hit: boolean): boolean {
    const x = this.pos.get("x") - scrollX;
    const y = this.pos.get("y") - scrollY;
    const r = el.getBoundingClientRect();
    const pad = 8;
    if (!hasBox(el) || x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return false;
    return !hit || el.contains(document.elementFromPoint(x, y));
  }

  /** Below-right of the tip, flipped to the left near the viewport's right edge. */
  private tagGoal(tip: Vec): Vec {
    const flip = tip.x - scrollX + TAG_OFFSET.x + this.tagWidth > innerWidth - 8;
    return {
      x: flip ? tip.x - this.tagWidth - 6 : tip.x + TAG_OFFSET.x,
      y: clamp(tip.y + TAG_OFFSET.y, scrollY + 8, scrollY + innerHeight - 32),
    };
  }

  private kick(): void {
    if (this.raf) return;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    if (!this.mounted) {
      this.raf = 0;
      return;
    }
    const dt = clamp((now - this.lastFrame) / 1000, 0, 1 / 20);
    this.lastFrame = now;
    this.update(now, dt);
    this.render();

    const fading = now - this.hiddenAt < 520;
    // A ring can outlive the hand (parked through a yield, or on a control pressed while the person was busy):
    // keep it on its element while the page scrolls.
    const tracking = this.visible || this.ringTarget !== null;
    this.raf = tracking || fading || !this.scale.isAtRest(0.002) ? requestAnimationFrame(this.frame) : 0;
  };

  private update(now: number, dt: number): void {
    const still = reduced();

    // 1. Where is the hand headed this frame?
    let carrot: Vec = { x: this.pos.get("x"), y: this.pos.get("y") };
    /** The target is outside the viewport (the page is still scrolling to it, or the person scrolled away). */
    let offscreen = false;
    if (this.aim && this.visible) {
      const goal = this.goalOf(this.aim);
      if (this.travel) {
        const s = clamp((now - this.travel.start) / this.travel.duration, 0, 1);
        carrot = arcPoint(this.travel.from, goal, this.travel.bend, minimumJerk(s));
        if (s >= 1) this.travel = null;
      } else {
        carrot = goal;
      }
      // Wait at the edge nearest the target instead of running ahead out of sight; parked, that is where the prompt shows.
      offscreen = distance(goal, this.inView(goal)) > 0;
      if (offscreen) carrot = this.inView(carrot, EDGE);
    } else if (this.rest && this.visible && now - this.restCheckedAt > REST_CHECK_MS) {
      this.restCheckedAt = now;
      if (!this.stillOn(this.rest.el, this.rest.hit)) void this.hide();
    }

    // 2. Physics.
    this.pos.setTarget(carrot);
    if (still) this.pos.snap(carrot);
    else this.pos.step(dt);
    const tip = { x: this.pos.get("x"), y: this.pos.get("y") };

    if (this.arrival && !this.travel && distance(tip, carrot) < 2.5 && (!offscreen || now > this.revealBy)) {
      const resolve = this.arrival;
      this.arrival = null;
      resolve(true);
    }

    // 3. Rocking: fades in once the hand has settled, fades out the moment it moves.
    const settled = !this.travel && distance(tip, carrot) < 6;
    this.sway.target = still || !this.visible || !settled ? 0 : this.parked ? 1.35 : 1;
    this.stepSpring(this.sway, dt, still);
    this.swayPhase = (this.swayPhase + dt * SWAY.hz * Math.PI * 2) % (Math.PI * 2);

    this.tilt.target = clamp(this.pos.velocity("x") * 0.008, -10, 10);
    this.stepSpring(this.tilt, dt, still);
    this.stepSpring(this.scale, dt, still);
    if (this.scale.value < PRESS_AT) for (const done of this.presses) done();

    // 4. Tag trails the tip.
    const tagGoal = this.tagGoal(tip);
    this.tag.setTarget(tagGoal);
    if (still) this.tag.snap(tagGoal);
    else this.tag.step(dt);

    // 5. Ring follows its element.
    if (this.ringTarget && hasBox(this.ringTarget)) {
      const r = docRect(this.ringTarget, RING_PAD);
      this.ring.setTarget(r);
      if (still) this.ring.snap(r);
      else this.ring.step(dt);
    }

    // 6. Spotlight frames the whole tool being worked in, not just one field,
    //    so it stays put while the cursor moves between a field and its button.
    if (this.spotlight && this.visible && !this.spotFrozen) {
      const focus = this.ringTarget ?? this.aim?.el ?? null;
      const target = focus?.closest("[toolname]") ?? focus;
      if (target?.isConnected) {
        const r = docRect(target, this.spotlight.padding);
        // A fresh show snaps into place; back-to-back calls glide from the last window.
        const recent = this.spotHiddenAt > 0 && now - this.spotHiddenAt < 1500;
        if (still || (!this.spotTarget && !recent)) this.spot.snap(r);
        else this.spot.setTarget(r);
        if (!this.spotTarget) this.spotEl.classList.add("is-visible");
        this.spotTarget = target;
      }
    }
    if (this.spotTarget && !still) this.spot.step(dt);
    // Library UI rendered in place (the devtools tab inside TanStack Devtools) stays sharp too.
    // Floating hosts are 0×0 and sit above the spotlight anyway.
    // The host list is re-queried a few times a second, not every frame; usually it's empty.
    if (!this.spotTarget) this.uiHosts = [];
    else if (now - this.uiHostsAt > UI_HOSTS_REFRESH_MS) {
      this.uiHosts = [...document.querySelectorAll(`[${UI_HOST_ATTR}]`)];
      this.uiHostsAt = now;
    }
    this.uiHoles = this.uiHosts.map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
  }

  private stepSpring(s: Spring, dt: number, still: boolean): void {
    if (still) {
      s.snap();
      return;
    }
    const SUB = 1 / 240;
    for (let t = dt; t > 0; t -= SUB) s.step(Math.min(SUB, t));
  }

  private render(): void {
    const sx = scrollX;
    const sy = scrollY;
    const amp = Math.max(0, this.sway.value);
    const wave = Math.sin(this.swayPhase);
    const rock = amp * SWAY.degrees * wave;
    const shift = amp * SWAY.px * Math.sin(this.swayPhase - 0.5);

    this.cursorEl.style.transform =
      `translate3d(${this.pos.get("x") - sx - HOTSPOT.x + shift}px, ${this.pos.get("y") - sy - HOTSPOT.y}px, 0) ` +
      `rotate(${this.tilt.value + rock}deg) scale(${this.scale.value})`;

    this.tagEl.style.transform = `translate3d(${this.tag.get("x") - sx + shift}px, ${this.tag.get("y") - sy}px, 0)`;

    if (this.ringTarget) {
      this.ringEl.style.transform = `translate3d(${this.ring.get("x") - sx}px, ${this.ring.get("y") - sy}px, 0)`;
      // Whole px: a settling spring then stops changing the size (a layout property) long before it is at rest.
      this.ringEl.style.width = `${Math.max(0, Math.round(this.ring.get("w")))}px`;
      this.ringEl.style.height = `${Math.max(0, Math.round(this.ring.get("h")))}px`;
    }

    if (this.spotTarget) {
      // Full-viewport layer with a rounded hole (even-odd), so only the focus stays sharp.
      const w = innerWidth;
      const h = innerHeight;
      // To 0.1 px: the spring closes in on its target for seconds, and every new value restyles the whole layer.
      const tenth = (v: number): number => Math.round(v * 10) / 10;
      const x = tenth(this.spot.get("x") - sx);
      const y = tenth(this.spot.get("y") - sy);
      const sw = tenth(this.spot.get("w"));
      const sh = tenth(this.spot.get("h"));
      // Even-odd: a point inside two holes is filled again, so UI holes leave out the spotlight window's box.
      const box = { left: x, top: y, right: x + sw, bottom: y + sh };
      const ui = this.uiHoles
        .flatMap((r) => subtractRect(r, box))
        .map((r) => `M${r.left} ${r.top}H${r.right}V${r.bottom}H${r.left}Z`)
        .join("");
      const clip = `path(evenodd, "M0 0H${w}V${h}H0Z${roundedRect(x, y, sw, sh, 14)}${ui}")`;
      // Settled window: skip the write, which would restyle a viewport-sized layer every frame.
      if (clip !== this.spotClip) this.spotEl.style.clipPath = this.spotClip = clip;
    }
  }

  private ripple(): void {
    if (reduced()) return;
    const el = Object.assign(document.createElement("div"), {
      className: `agent-ripple${this.parked ? " is-waiting" : ""}`,
    });
    el.setAttribute("aria-hidden", "true");
    el.style.transform = `translate3d(${this.pos.get("x") - scrollX}px, ${this.pos.get("y") - scrollY}px, 0)`;
    el.addEventListener("animationend", () => el.remove(), { once: true });
    document.body.append(el);
  }
}

/** Re-trigger a CSS animation that is driven by a class. */
function restartAnimation(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** The page's one cursor. The constructor touches no DOM; `ensure()` builds it on first use. */
export const agentCursor = new GhostCursor();
export { GhostCursor };
