/**
 * WebTool: one tool definition for every place a tool runs.
 *
 * The config is a structural superset of Mastra's `createTool` config and the
 * AI SDK's `tool()` input (`id`, `description`, `inputSchema`, `outputSchema`,
 * `execute`), so the same object registers with the browser
 * (`document.modelContext.registerTool`), shows up in devtools, and can be sent
 * to a server agent as a client-side tool. Schemas are Standard Schema (zod 4,
 * valibot, arktype), exported to JSON Schema through Standard JSON Schema, or
 * plain JSON Schema objects.
 *
 *   const addToCart = defineWebTool({
 *     id: "add_to_cart",
 *     description: "Add a product to the cart",
 *     inputSchema: z.object({ sku: z.string(), qty: z.number().int().min(1) }),
 *     execute: ({ sku, qty }, ctx) => ctx.context!.add(sku, qty),
 *   });
 */
import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";
import {
  CONFIRM,
  ConfirmationUnavailableError,
  type FieldStep,
  STAGE,
  type Stage,
  type Staged,
  stages,
  supersedeWaiting,
  type ToolControls,
  TARGET,
  waitForConfirmation,
} from "./confirm";
import type { CallTracker } from "./deferred";
import { type ExecuteToolOptions, executeTool } from "./execute";
import { ACTIONS, type FieldTarget, locateAll, locateField, type ToolLocator, usable, words } from "./locate";
import { polyfillLoading, whenModelContext } from "./model-context";
import { abortError, errorResult, isAbortError, toolErrorCode, toToolResult, WebToolError } from "./result";
import { isControl, writeControl } from "./write";

/**
 * Augment to type `ctx.context` (the provider's `context` prop / the registry's `context` option):
 *
 *   declare module "@webmcp-agents/core" { interface Register { context: CartApi } }
 */
// biome-ignore lint/suspicious/noEmptyInterface: an augmentation point, empty until the app fills it
export interface Register {}

/** The app state tools receive as `ctx.context`: `unknown` until `Register` is augmented. */
export type RegisteredContext = Register extends { context: infer C } ? C : unknown;

/** MCP tool annotations: hints for the agent, never enforced. */
export interface WebToolAnnotations {
  /** The tool only reads. */
  readOnlyHint?: boolean;
  /** The tool may destroy or overwrite data. */
  destructiveHint?: boolean;
  /** Calling again with the same input has no further effect. */
  idempotentHint?: boolean;
  /** The tool reaches beyond the page (network, other systems). */
  openWorldHint?: boolean;
  /** The result may contain content the agent should not trust as instructions. */
  untrustedContentHint?: boolean;
  [hint: string]: unknown;
}

/** What `execute` gets besides its input. */
export interface WebToolContext {
  /** Aborts when the call is cancelled (the agent gave up, the user cancelled). */
  signal: AbortSignal;
  /** Who called: the browser's WebMCP, a chat widget, devtools or a test. */
  source: "webmcp" | "chat" | "devtools" | "test";
  toolCallId?: string;
  /** App state from the provider's `context` prop (or the registry's `context` option). Typed via `Register`. */
  context?: RegisteredContext;
}

export interface WebToolConfig<I = unknown, O = unknown> {
  /** The WebMCP tool name: 1–128 of `a-z A-Z 0-9 _ . -`. Snake case reads best to agents (`clear_cart`). */
  id: string;
  /** Human-readable name, for UIs that list tools. */
  title?: string;
  /** What the tool does and when to use it: the agent reads this to decide. */
  description: string;
  /** Standard Schema (zod 4 / valibot / arktype) or a JSON Schema object. Must describe an object. Default: no input. */
  inputSchema?: StandardSchemaV1<unknown, I> | JSONSchema;
  /** Checked in development only: a mismatch warns, never throws. */
  outputSchema?: StandardSchemaV1<unknown, O>;
  /** Only reads: safe to call at any time. Becomes the WebMCP annotation `readOnlyHint`. Default: not said. */
  readOnly?: boolean;
  /** Deletes or overwrites; hard to undo. Becomes `destructiveHint`. Default: not said. */
  destructive?: boolean;
  /** Calling twice has the same effect as once. Becomes `idempotentHint`. Default: not said. */
  repeatable?: boolean;
  /** Talks to something outside the page (the network, another system). Becomes `openWorldHint`. Default: not said. */
  external?: boolean;
  /**
   * `false`: the answer may contain text the site did not write (reviews, messages), so an agent must not follow
   * instructions in it. Becomes `untrustedContentHint`, inverted. Default: not said, which agents read as safe.
   */
  safeResponse?: boolean;
  /** Raw WebMCP annotations, for a hint without a flag above. A flag wins over the same hint here. */
  annotations?: WebToolAnnotations;
  /**
   * Wait for the person to click the tool's control (see `target`) before running. For destructive or
   * consequential actions. With the visuals installed, the cursor parks on the control instead of clicking it.
   * The call fails rather than run unconfirmed when there is no control to click, or when a name matches several.
   * It waits 10 s (then fails with `needs_user`), and a call the person starts themself meanwhile cancels it.
   * Default false.
   */
  requireConfirmation?: boolean;
  /**
   * Which control on the page this tool acts on: where the cursor goes, and whose click confirms. Usually
   * unnecessary: the control is found by its name, the tool's `title` (or its id read as words, `clear_cart` →
   * "clear cart"), among buttons, links, tabs, menu items and switches. Say it when the name differs or depends on
   * the call: a locator (`{ role: "button", name: "Empty the cart" }`), a CSS selector, or a function of the input
   * returning either or the element (`({ lineId }) => ({ role: "button", name: \`Remove ${names[lineId]}\` })`).
   * A target that matches nothing falls back to an element marked `toolname="<id>"`, then to the name. A tool with
   * no control on the page runs at once, unseen.
   */
  target?: ToolTarget | TargetFn<I>;
  /**
   * Where each parameter is typed, by parameter name. Usually unnecessary: the cursor types a value into the
   * control whose `name` is the parameter, else the one labelled with the schema's `title` for it or with the
   * parameter read as words, the closest one to the tool's control. Give a locator or the label's text to point
   * elsewhere, `false` to never type that parameter. A parameter with no field is skipped; `execute` still gets it.
   */
  fields?: { readonly [K in FieldKey<I>]?: FieldTarget };
  /**
   * Put the call's values on screen yourself, for what the cursor cannot type into (a custom select, a date
   * picker): `fill: (values) => form.reset(values)`. Runs after the cursor typed what it could and before it
   * clicks or parks; a promise it returns is awaited, any other return value ignored. A throw fails the call.
   * Declared as a method so a `WebTool<Input>` still fits where a `WebTool<unknown>` is expected.
   */
  fill?(values: I): unknown;
  /**
   * Where a catalog tool is on: a path pattern (`/orders`, `/product/:slug`, `/flights/*`), several, or a RegExp
   * tested against the path. Read by `createWebAgents` and `<WebAgentsProvider>`. Default: on every page.
   */
  match?: string | readonly string[] | RegExp;
  /** Do the work. Throw for bad input or failures: the agent gets the message as an error result. */
  execute(input: I, ctx: WebToolContext): O | Promise<O>;
  /**
   * Undo this call's page side effects (cart, navigation, booking). Client-only: never sent to the model.
   * Chat restore calls it newest-first when the person rewinds past this tool call. Field fills are restored
   * automatically; implement this for everything else. Omit on read-only tools.
   */
  revert?(input: I, ctx: WebToolContext & { output?: O }): void | Promise<void>;
}

/** What a `target` can be once it is known: a locator, a CSS selector, or the element itself. */
export type ToolTarget = string | ToolLocator;

/** The parameter names `fields` may use: the input's keys, or any string when the input is untyped (JSON Schema). */
type FieldKey<I> = unknown extends I ? string : Extract<keyof I, string>;

/** `invoke`'s arguments: the input is optional when the tool takes none (or only optional parameters). */
// biome-ignore lint/complexity/noBannedTypes: `{}` is the point: "an input with nothing required"
type InvokeArgs<I> = {} extends I ? [input?: I, options?: ExecuteToolOptions] : [input: I, options?: ExecuteToolOptions];

/** A defined tool: the config, its input as JSON Schema, `invoke` (call it as an agent would) and `run` (validate, then execute). */
export interface WebTool<I = unknown, O = unknown> extends Readonly<Omit<WebToolConfig<I, O>, "execute">> {
  readonly kind: "web-tool";
  /** The input schema as JSON Schema draft-07, without `$schema`. Computed on first read. */
  readonly jsonSchema: JSONSchema;
  /** The config's `execute`, always async. */
  execute(input: I, ctx: WebToolContext): Promise<O>;
  /** Validate `input` against `inputSchema` (Standard Schema only; JSON Schema input passes through). Throws `WebToolInputError`. */
  parse(input: unknown): Promise<I>;
  /** `parse`, then `execute`: no page, no cursor, no confirmation. For unit tests. */
  run(input: unknown, ctx: WebToolContext): Promise<O>;
  /**
   * Call the tool the way an agent would, through `document.modelContext`: the cursor moves, fields are typed,
   * confirmation applies. Resolves to what `execute` returned (undefined when the call navigated the page away).
   * Rejects with a `WebToolError` carrying the agent's error code when the call fails, with an AbortError when
   * `options.signal` aborts, and when the tool is not registered on the page right now.
   */
  invoke(...args: InvokeArgs<I>): Promise<O>;
}

/** The input failed the tool's schema. The message names each bad field, for the agent to fix its call. */
export class WebToolInputError extends Error {
  override name = "WebToolInputError";
  constructor(
    readonly toolId: string,
    readonly issues: ReadonlyArray<StandardSchemaV1.Issue>,
  ) {
    super(`Invalid input for ${toolId}: ${issues.map(describeIssue).join("; ")}`);
  }
}

function describeIssue(issue: StandardSchemaV1.Issue): string {
  const path = (issue.path ?? []).map((p) => String(typeof p === "object" ? p.key : p)).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

const ID_PATTERN = /^[a-zA-Z0-9_.-]{1,128}$/;

const isStandardSchema = (s: unknown): s is StandardSchemaV1 => typeof s === "object" && s !== null && "~standard" in s;

function deriveJsonSchema(id: string, schema: WebToolConfig["inputSchema"]): JSONSchema {
  if (schema === undefined) return { type: "object", properties: {} };
  let json: JSONSchema;
  if (isStandardSchema(schema)) {
    const converter = (schema["~standard"] as Partial<StandardJSONSchemaV1.Props>).jsonSchema;
    if (!converter?.input) {
      throw new TypeError(
        `WebTool "${id}": this schema library doesn't implement Standard JSON Schema. Pass a JSON Schema object instead, e.g. z.toJSONSchema(schema, { target: "draft-07", io: "input" }).`,
      );
    }
    json = { ...converter.input({ target: "draft-07" }) };
  } else {
    json = { ...schema };
  }
  delete json.$schema;
  json.type ??= "object";
  if (json.type !== "object")
    throw new TypeError(
      `WebTool "${id}": inputSchema must describe an object (WebMCP tools take named arguments), got type ${JSON.stringify(json.type)}.`,
    );
  return json;
}

/** @internal True outside production builds: development-only checks and console notes. */
export const isDev = (): boolean => (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";

/** The WebMCP hint each plain flag becomes. */
const FLAGS = [
  ["readOnly", "readOnlyHint"],
  ["destructive", "destructiveHint"],
  ["repeatable", "idempotentHint"],
  ["external", "openWorldHint"],
  ["safeResponse", "untrustedContentHint"],
] as const;

/** A tool's WebMCP annotations: its `annotations`, with each flag it sets written over them (`safeResponse` inverted). */
function annotationsOf(tool: WebTool): WebToolAnnotations | undefined {
  const hints: WebToolAnnotations = { ...tool.annotations };
  for (const [flag, hint] of FLAGS) if (tool[flag] !== undefined) hints[hint] = tool[flag] === (flag !== "safeResponse");
  return Object.keys(hints).length ? hints : undefined;
}

/** `invoke` calls waiting for their tool's own return value, oldest first, by tool id: WebMCP only carries it as text. */
const outputs: Record<string, unknown[][]> = {};

/** Tools already told (in development) that they run unseen. */
const unseen = new Set<string>();

/** Define a tool. Checks the id now; derives the JSON Schema on first use. */
export function defineWebTool<I, O>(
  config: WebToolConfig<I, O> & { inputSchema: StandardSchemaV1<unknown, I> },
): WebTool<I, O> & { readonly inputSchema: StandardSchemaV1<unknown, I> };
export function defineWebTool<I = unknown, O = unknown>(config: WebToolConfig<I, O>): WebTool<I, O>;
export function defineWebTool<I, O>(config: WebToolConfig<I, O>): WebTool<I, O> {
  const { id, inputSchema, outputSchema } = config;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new TypeError(`WebTool id ${JSON.stringify(id)} is invalid: use 1–128 letters, digits, "_", "." or "-" (e.g. "clear_cart").`);
  }
  const execute = async (input: I, ctx: WebToolContext): Promise<O> => config.execute(input, ctx);
  const parse = async (input: unknown): Promise<I> => {
    const value = input ?? {};
    if (!isStandardSchema(inputSchema)) return value as I;
    const checked = await inputSchema["~standard"].validate(value);
    if (checked.issues) throw new WebToolInputError(id, checked.issues);
    return checked.value as I;
  };
  let jsonSchema: JSONSchema | undefined;

  const tool: WebTool<I, O> = {
    ...config,
    kind: "web-tool",
    get jsonSchema() {
      jsonSchema ??= deriveJsonSchema(id, inputSchema);
      return jsonSchema;
    },
    execute,
    parse,
    async run(input, ctx) {
      const output = await execute(await parse(input), ctx);
      if (outputSchema && isDev()) {
        const checked = await outputSchema["~standard"].validate(output);
        if (checked.issues) console.warn(`[web-agents] "${id}" returned output that doesn't match its outputSchema:`, checked.issues);
      }
      return output;
    },
    async invoke(input?: I, options?: ExecuteToolOptions) {
      const slot: unknown[] = [];
      outputs[id] = [...(outputs[id] ?? []), slot];
      try {
        const result = await executeTool(id, (input ?? {}) as Record<string, unknown>, options);
        if (result?.isError)
          throw new WebToolError(toolErrorCode(result) ?? "failed", `${result.content[0]?.text}`.replace(/^Error.*?: /, ""));
        return slot[0] as O;
      } finally {
        outputs[id] = (outputs[id] ?? []).filter((other) => other !== slot); // still there: the call never reached execute
      }
    },
  };
  return Object.freeze(tool);
}

/** What WebMCP sees of a tool. When it changes, the tool must re-register; when it doesn't, it mustn't (Chrome cancels its calls). */
export const webToolSignature = (t: WebTool): string =>
  JSON.stringify([t.id, t.title, t.description, t.jsonSchema, annotationsOf(t) ?? null, !!t.requireConfirmation, t.target ?? null]);

/** Options for `toModelContextTool` / `registerWebTool`. */
export interface ToModelContextToolOptions {
  /** Read on every call and passed to execute as `ctx.context`. */
  context?: () => unknown;
  /** Counts each call (confirmation wait included), so unregistering can wait for it. */
  calls?: CallTracker;
}

/**
 * A per-call target: the control for this input, as a locator, a CSS selector or the element. It gets the validated
 * input when the call runs, but the arguments as sent (possibly none) when a run is animated after the fact, so read
 * them defensively; a throw counts as no target. Declared as a method so a `WebTool<Input>` still fits where a
 * `WebTool<unknown>` is expected (registries hold mixed tools).
 */
export type TargetFn<I> = { pick(input: I): ToolTarget | Element | null | undefined }["pick"];

/** Chrome 150 passed the arguments as a JSON string. */
const fromJson = (args: unknown): unknown => (typeof args === "string" ? JSON.parse(args || "{}") : args);

/** Adapt a WebTool to the shape `document.modelContext.registerTool` takes. Failures become `isError` results; cancellation rejects. */
export function toModelContextTool(tool: WebTool, { context, calls }: ToModelContextToolOptions = {}): ModelContextTool {
  // Ids are [a-zA-Z0-9_.-]: safe inside a quoted attribute selector without CSS.escape (absent in Node).
  const fallback = `[toolname="${tool.id}"]`;
  /** The target for this call: a function target sees the input; a throwing one, or one building invalid CSS, counts as none. */
  const targetFor = (input: unknown): ToolTarget | Element | undefined => {
    if (typeof tool.target !== "function") return tool.target;
    try {
      const target = tool.target(fromJson(input)) ?? undefined;
      if (typeof target === "string" && typeof document !== "undefined") document.querySelector(target); // throws on invalid CSS
      return target;
    } catch {
      return undefined; // built from agent input: never let a bad selector break the run
    }
  };
  /**
   * Every element this call may act on, in order: the tool's own target, else an element marked `toolname`, else
   * the controls named like the tool. `what` describes them for an error; `named` when they were found by name,
   * where several is ambiguous.
   */
  const resolve = (input: unknown): { hits: Element[]; what: string; named?: boolean; by: ToolControls["by"] } => {
    const name = tool.title ?? words(tool.id);
    if (typeof document === "undefined") return { hits: [], what: name, by: "name" };
    const target = targetFor(input);
    const all = (selector: string): Element[] => {
      try {
        return [...document.querySelectorAll(selector)];
      } catch {
        return []; // a selector that isn't CSS matches nothing
      }
    };
    const locator = typeof target === "object" && !(target instanceof Element) ? target : undefined;
    const what = typeof target === "string" ? target : `"${locator?.name ?? name}"`;
    let hits = typeof target === "string" ? all(target) : target instanceof Element ? [target] : locator ? locateAll(locator) : [];
    const named = !!hits[0] && !!locator;
    const by = hits[0] ? "target" : "marker";
    if (!hits[0]) hits = all(fallback);
    return hits[0] ? { hits, what, named, by } : { hits: locateAll({ name }, ACTIONS), what, named: true, by: "name" };
  };
  /** The one to point at: the first a person could use (a duplicated marker's first match may be the hidden one). */
  const pick = (hits: Element[]): Element | null => hits.find(usable) ?? hits[0] ?? null;
  /** The field a parameter's value goes into: its `fields` entry, else found near the control `el`. */
  const fieldFor = (name: string, value: unknown, el: Element | null): Element | null => {
    const spec = (tool.fields as Record<string, FieldTarget | undefined> | undefined)?.[name];
    const titles = (tool.jsonSchema.properties ?? {}) as Record<string, { title?: string } | undefined>;
    return spec === false ? null : locateField(name, value, spec, titles[name]?.title, el);
  };

  const stage: Stage = Object.assign(
    async (args: unknown): Promise<Staged> => {
      const input = await tool.parse(fromJson(args));
      // A valid call the person started takes over from a confirmation still waiting (an agent's call never does).
      supersedeWaiting(tool.id);
      const { hits, what } = resolve(input);
      const el = pick(hits);
      const fields: FieldStep[] = [];
      if (typeof document !== "undefined") {
        for (const [name, value] of Object.entries(input ?? {})) {
          // nothing to type for an absent or structured value
          if (value == null || typeof value === "object") continue;
          const field = fieldFor(name, value, el);
          if (field) fields.push({ name, field, to: typeof value === "boolean" ? value : String(value) });
        }
        fields.sort((a, b) => (a.field.compareDocumentPosition(b.field) & 2 ? 1 : -1)); // 2: b comes before a
        if (!el && !tool.readOnly && isDev() && !unseen.has(tool.id)) {
          unseen.add(tool.id);
          console.info(`[web-agents] "${tool.id}" runs unseen: nothing on the page matches ${what}. Set \`title\` or \`target\`.`);
        }
      }
      let filled: Promise<void> | undefined;
      const fill = (): Promise<void> => {
        filled ??= (async () => {
          await tool.fill?.(input);
        })();
        return filled;
      };
      return { input, el, fields, what, confirm: !!tool.requireConfirmation, fill };
    },
    {
      at(args?: unknown): Element | null {
        try {
          return pick(resolve(fromJson(args)).hits);
        } catch {
          return null; // arguments that aren't JSON
        }
      },
      tool,
      inspect(): ToolControls {
        // a function target needs a call's input: nothing to resolve without one
        const { hits: controls, by } = typeof tool.target === "function" ? { hits: [], by: "call" as const } : resolve(undefined);
        const el = pick(controls);
        const fields = Object.keys(tool.jsonSchema.properties ?? {}).map((name) => ({ name, field: fieldFor(name, undefined, el) }));
        return { by, controls, fields };
      },
    },
  );

  const call = async (args: unknown, signal: AbortSignal, staged?: Staged): Promise<ModelContextToolResult> => {
    try {
      const { input, fields, fill, what } = staged ?? (await stage(args));
      // Whatever the cursor did not type (no visuals, or it gave up waiting) is written now, in one step.
      for (const step of fields) {
        if (!step.done && isControl(step.field)) writeControl(step.field, step.to, true);
        step.done = true;
      }
      await fill();
      // Only a valid call asks the user: they must never approve something that then fails validation.
      if (tool.requireConfirmation)
        await waitForConfirmation(
          () => {
            const found = resolve(input);
            if (found.named && found.hits[1])
              throw new ConfirmationUnavailableError(
                `"${tool.id}" needs the user's confirmation, but ${found.hits.length} controls match ${found.what}. Set a \`target\` that picks one.`,
              );
            return found.hits;
          },
          signal,
          tool.id,
          what,
        );
      if (signal.aborted) throw abortError(signal); // cancelled while validating: don't start the work
      const output = await tool.execute(input, { signal, source: "webmcp", context: context?.() as RegisteredContext });
      outputs[tool.id]?.shift()?.push(output);
      return toToolResult(output);
    } catch (err) {
      if (isAbortError(err)) throw err;
      return errorResult(
        err,
        err instanceof WebToolInputError ? "invalid_input" : err instanceof ConfirmationUnavailableError ? "unavailable" : "failed",
      );
    }
  };
  return {
    name: tool.id,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.jsonSchema,
    annotations: annotationsOf(tool),
    // The selector forms of the target, as the visuals read them before `STAGE` existed: kept for code that still does.
    [CONFIRM]: tool.requireConfirmation ? (typeof tool.target === "string" ? tool.target : fallback) : undefined,
    [TARGET]: typeof tool.target === "function" ? targetFor : tool.target,
    // Read by the visuals layer: validate and locate a call before the cursor moves.
    [STAGE]: stage,
    execute(args: unknown, options?: ModelContextExecuteOptions & { [STAGE]?: Staged }) {
      const signal = options?.signal ?? new AbortController().signal;
      return calls ? calls.track(() => call(args, signal, options?.[STAGE])) : call(args, signal, options?.[STAGE]);
    },
  } as ModelContextTool;
}

let warnedUnavailable = false;

/** The live registration per tool id, so a stale unregister can't remove a newer registration of the same id. */
const owners = new Map<string, () => void>();

/** True when the page has `document.modelContext` (native WebMCP or the polyfill). */
export const isWebMCPAvailable = (): boolean => typeof document !== "undefined" && !!document.modelContext;

/**
 * Register a WebTool with `document.modelContext`. Returns an unregister
 * function (idempotent; aborting `signal` does the same). While the polyfill
 * that `createWebAgents` (or `<WebAgentsProvider>`) loads is on its way, the
 * registration waits for it. Without WebMCP and with no polyfill coming it
 * warns once and returns a no-op, so the app still renders.
 *
 * Pass a function instead of a tool for one whose definition changes while it
 * stays registered (a component's tool closing over state): what WebMCP sees
 * (id, title, description, schema, flags) is read once, now; `execute`,
 * `target`, `fields` and `fill` are read from the function's tool on every call.
 *
 * Registering an id that is already registered through this function
 * replaces that registration; the replaced one's unregister becomes a no-op.
 *
 * Unregistering cancels the tool's in-flight calls in Chrome: from UI code,
 * release through `deferRelease` with a `CallTracker` (the registry and the
 * React hooks do).
 */
export function registerWebTool(
  source: WebTool | (() => WebTool),
  { signal, ...options }: ToModelContextToolOptions & { signal?: AbortSignal } = {},
): () => void {
  // An empty target: a frozen tool's own properties could not be answered with the latest ones.
  const tool = typeof source === "function" ? new Proxy({} as WebTool, { get: (_, key) => Reflect.get(source(), key) }) : source;
  const mc = typeof document !== "undefined" ? document.modelContext : undefined;
  if (!mc) {
    if (typeof document === "undefined") return () => {};
    if (polyfillLoading()) {
      // createWebAgents is loading the polyfill: register once it is here.
      let unregister: (() => void) | undefined;
      const stop = whenModelContext(() => {
        unregister = registerWebTool(source, { signal, ...options });
      });
      return () => {
        stop();
        unregister?.();
      };
    }
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn(
        "[web-agents] document.modelContext is unavailable: tools are not registered. createWebAgents and <WebAgentsProvider> load the polyfill.",
      );
    }
    return () => {};
  }
  const ac = new AbortController();
  let done = false;
  const unregister = (): void => {
    if (done) return;
    done = true;
    signal?.removeEventListener("abort", unregister);
    if (owners.get(tool.id) !== unregister) return; // replaced: the id belongs to a newer registration
    owners.delete(tool.id);
    stages.delete(tool.id);
    ac.abort();
    mc.unregisterTool?.(tool.id);
  };
  if (signal?.aborted) return () => {};
  owners.get(tool.id)?.(); // Chrome rejects a duplicate name: the newest registration wins
  signal?.addEventListener("abort", unregister, { once: true });
  const registered = toModelContextTool(tool, options) as ModelContextTool & { [STAGE]: Stage };
  mc.registerTool(registered, { signal: ac.signal });
  owners.set(tool.id, unregister);
  stages.set(tool.id, registered[STAGE]);
  return unregister;
}
