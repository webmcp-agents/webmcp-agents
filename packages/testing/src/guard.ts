/**
 * What `./setup` checks after each test: no tool call it started is still running, and no tool it registered is still
 * registered. Either fails the test with the tool's name, then is cleaned up so the next test starts from a clean page.
 *
 * Calls are tracked by wrapping `document.modelContext.executeTool` (every agent path goes through it: `callTool`,
 * `tool.invoke`, the chat, the devtools). Registrations are compared by name: what is registered after the test
 * minus what was registered before it (tools a `beforeAll` registered are the file's, not the test's).
 */
import { sleep } from "./helpers/wait";

const WRAPPED = Symbol.for("web-agents.testing.guarded");

interface Call {
  name: string;
  args: unknown;
  epoch: number;
  controller: AbortController;
}

let epoch = 0;
const running = new Set<Call>();
let before = new Set<string>();
const cleanups: (() => unknown)[] = [];

/** How long `end` lets a call that is about to answer finish, and a deferred release happen. */
export const SETTLE_MS = { calls: 1000, tools: 2000 } as const;

/** Wrap `mc.executeTool` once, so every call is tracked and can be cancelled. */
export function guardModelContext(mc: ModelContext): void {
  const target = mc as ModelContext & { [WRAPPED]?: true };
  if (target[WRAPPED]) return;
  const original = mc.executeTool.bind(mc);
  target[WRAPPED] = true;
  target.executeTool = (tool, args, options = {}) => {
    const name = typeof tool === "string" ? tool : tool.name;
    const controller = new AbortController();
    const outer = options.signal;
    if (outer?.aborted) controller.abort(outer.reason);
    else outer?.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
    const call: Call = { name, args: typeof args === "string" ? safeParse(args) : args, epoch, controller };
    running.add(call);
    return original(tool, args, { ...options, signal: controller.signal }).finally(() => running.delete(call));
  };
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** Run `fn` when the test ends, before the checks (the kit's fixtures register their teardown here). */
export function deferCleanup(fn: () => unknown): void {
  cleanups.push(fn);
}

const registered = async (): Promise<Set<string>> =>
  new Set(typeof document === "undefined" || !document.modelContext ? [] : (await document.modelContext.getTools()).map((t) => t.name));

/** A new test starts: remember what is registered now. */
export async function beginTest(): Promise<void> {
  epoch++;
  before = await registered();
}

const preview = (value: unknown): string => {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text.length > 120 ? `${text.slice(0, 117)}...` : text;
  } catch {
    return String(value);
  }
};

/**
 * The test ended: run the deferred cleanups, wait briefly for calls and releases under way, then report (and clean
 * up) what is left. Resolves to the problems, in words; empty when the test left nothing behind.
 */
export async function endTest(extraCleanup: () => unknown = () => {}): Promise<string[]> {
  const problems: string[] = [];
  for (const fn of cleanups.splice(0).reverse()) {
    try {
      await fn();
    } catch (err) {
      problems.push(`Cleaning up after the test failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await extraCleanup();

  // ---------- 1. calls this test started ----------
  const mine = (): Call[] => [...running].filter((c) => c.epoch === epoch);
  for (let waited = 0; mine().length && waited < SETTLE_MS.calls; waited += 25) await sleep(25);
  for (const call of mine()) {
    problems.push(
      `The test ended while a call to the tool "${call.name}" was still running (input ${preview(call.args)}). ` +
        "Await the call, or cancel it with an AbortSignal, before the test ends.",
    );
    call.controller.abort(new DOMException("The test ended.", "AbortError"));
  }

  // ---------- 2. tools this test registered ----------
  const left = async (): Promise<string[]> => [...(await registered())].filter((n) => !before.has(n));
  let names = await left();
  for (let waited = 0; names.length && waited < SETTLE_MS.tools; waited += 50) {
    await sleep(50);
    names = await left();
  }
  for (const name of names) {
    problems.push(
      `The test left the tool "${name}" registered. Unregister it before the test ends (abort the signal passed to ` +
        "registerTool, unmount the component, remove the form), or register it with tools.mock(), which cleans up after the test.",
    );
    document.modelContext?.unregisterTool?.(name);
  }
  return problems;
}
