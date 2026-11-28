/** Waiting, without fixed sleeps where a condition can be checked. */

/** Options for {@link until}. */
export interface UntilOptions {
  /** Give up after this many ms. Default 3000. */
  timeout?: number;
  /** What is awaited, for the timeout message. Default `"condition"`. */
  label?: string;
}

const tick = (): Promise<unknown> =>
  typeof requestAnimationFrame === "function"
    ? // a frame, but never longer than 50 ms: a hidden page fires no rAF
      Promise.race([new Promise((r) => requestAnimationFrame(r)), new Promise((r) => setTimeout(r, 50))])
    : new Promise((r) => setTimeout(r, 16));

/**
 * Resolve once `check` returns true (it may be async), polling every frame (every 16 ms in Node). Resolves to the ms
 * it took. Rejects after `timeout` with `Timed out after <timeout> ms waiting for <label>`. The second argument is the
 * timeout (ms), the label, or both as options.
 *
 * @example
 * await until(() => cursorVisible(), 2000, "the cursor");
 * await until(async () => (await toolNames()).includes("add_to_cart"), { label: "add_to_cart to register" });
 * await until(() => !!document.modelContext, "the polyfill");
 */
export async function until(
  check: () => boolean | Promise<boolean>,
  timeoutOrOptions: number | string | UntilOptions = {},
  label?: string,
): Promise<number> {
  const options =
    typeof timeoutOrOptions === "number"
      ? { timeout: timeoutOrOptions, label }
      : typeof timeoutOrOptions === "string"
        ? { label: timeoutOrOptions }
        : timeoutOrOptions;
  const { timeout = 3000 } = options;
  const what = options.label ?? label ?? "condition";
  const started = performance.now();
  while (!(await check())) {
    if (performance.now() - started > timeout) throw new Error(`Timed out after ${timeout} ms waiting for ${what}`);
    await tick();
  }
  return performance.now() - started;
}

/** `setTimeout` as a promise. Prefer {@link until} when there is something to wait for. */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
