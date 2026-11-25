/**
 * Where the page's (or the process's) redactor lives: a `globalThis` slot, so every copy of the package shares one.
 */
import type { Redactor } from "./redactor";

/** On `globalThis`, so two copies of the package (a dist and a source build) share one redactor. */
export const SLOT = Symbol.for("web-agents.redactor");

/** `globalThis` seen as the slot's holder. */
export type Slot = { [SLOT]?: Redactor };
