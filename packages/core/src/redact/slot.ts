/**
 * Where the page's (or the process's) redactor lives, and the one helper core's own console lines use. Kept apart from
 * the redactor so the main entry reaches the configured redactor without bundling it (core's size budget).
 */
import type { Redactor } from "./redactor";

/** On `globalThis`, so two copies of the package (a dist and a source build) share one redactor. */
export const SLOT = Symbol.for("web-agents.redactor");

/** `globalThis` seen as the slot's holder. */
export type Slot = { [SLOT]?: Redactor };

/**
 * What core's own console lines print for a caught value: its message, redacted, once a redactor exists on the page
 * (`getRedactor` or `configureRedaction` ran: `createWebAgents`, the provider, the devtools and the chat make sure of
 * it). Before that, the value as it is.
 */
export const forLog = (value: unknown): unknown => (globalThis as Slot)[SLOT]?.error(value) ?? value;
