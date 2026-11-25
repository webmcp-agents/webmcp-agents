import {
  executeTool,
  type JSONSchema,
  type ModelContext,
  type ModelContextToolInfo,
  type ModelContextToolResult,
  toolError,
  toToolResult,
  type WebTool,
  WebToolError,
  WebToolInputError,
} from "@webmcp-agents/core";
import { installWebMCPPolyfill } from "@webmcp-agents/core/polyfill";
import { type Mock, vi } from "vitest";

/**
 * The page's `document.modelContext`, installing the polyfill where the browser has none. With `./setup` it is already
 * installed; call this in a test file that set up its own page.
 */
export function modelContext(): ModelContext {
  const mc = installWebMCPPolyfill();
  if (!mc) throw new Error("modelContext() needs a page: run this test in browser mode (a *.browser.test file).");
  return mc;
}

/** The text of a tool result (its text parts, joined with a space). A string is returned as is; null gives `""`. */
export const resultText = (res: unknown): string =>
  typeof res === "string"
    ? res
    : ((res as ModelContextToolResult | null)?.content ?? [])
        .map((c) => ("text" in c && typeof c.text === "string" ? c.text : ""))
        .join(" ");

/** The names of the tools registered on the page right now. */
export const toolNames = async (): Promise<string[]> => (await modelContext().getTools()).map((t) => t.name);

/** Count `toolchange` events from now on. `stop()` removes the listener. */
export function countToolChanges(): { count: () => number; stop: () => void } {
  let n = 0;
  const onChange = (): void => {
    n++;
  };
  const mc = modelContext();
  mc.addEventListener("toolchange", onChange);
  return { count: () => n, stop: () => mc.removeEventListener("toolchange", onChange) };
}

/** Options for {@link callTool}. */
export interface CallToolOptions {
  /** Aborting it cancels the call; the promise then rejects with an AbortError. */
  signal?: AbortSignal;
}

const isWebTool = (value: unknown): value is WebTool =>
  typeof value === "object" && value !== null && (value as WebTool).kind === "web-tool";

/** What a defined tool's run threw, as the result an agent would read. */
function failure(err: unknown): ModelContextToolResult {
  if (err instanceof WebToolInputError || (err as Error | null)?.name === "WebToolInputError")
    return toolError("invalid_input", (err as Error).message);
  if (err instanceof WebToolError || (err as Error | null)?.name === "WebToolError")
    return toolError((err as WebToolError).code ?? "failed", (err as Error).message);
  if ((err as Error | null)?.name === "AbortError") throw err;
  return toolError("failed", err instanceof Error ? err.message : String(err));
}

/**
 * Call a tool the way an agent would and resolve to its MCP result (`{ content, isError?, structuredContent? }`); the
 * tool matchers (`toBeToolResult`, `toBeToolError`, `toHaveStructuredContent`) read it. Never rejects for a tool's
 * failure: that is an `isError` result, as the agent sees it.
 *
 * - `callTool("add_to_cart", input)`: through `document.modelContext` (browser): the cursor moves, confirmation applies.
 *   Resolves to null when the call navigated the page away.
 * - `callTool(addToCart, input)` with a `defineWebTool` tool: through the page when it is registered there; otherwise
 *   (in Node, or before it is mounted) its `run` (schema, then `execute`) in-process, no page and no cursor.
 *
 * @example
 * expect(await callTool(addToCart, { id: "mug-01", qty: 2 })).toBeToolResult(/2 × Field Mug/);
 */
export async function callTool(
  tool: string | WebTool,
  input: Record<string, unknown> = {},
  { signal }: CallToolOptions = {},
): Promise<ModelContextToolResult | null> {
  if (typeof tool !== "string" && !isWebTool(tool)) {
    throw new TypeError(
      `callTool() needs a tool name or a defineWebTool tool, got ${typeof tool === "object" ? JSON.stringify(tool) : String(tool)}.`,
    );
  }
  const name = typeof tool === "string" ? tool : tool.id;
  const mc = typeof document === "undefined" ? undefined : document.modelContext;
  const onPage = !!mc && (await mc.getTools()).some((t) => t.name === name);
  if (typeof tool === "string" || onPage) {
    if (!mc)
      throw new Error(
        `callTool("${name}") needs a page with WebMCP: run it in browser mode, or pass the defineWebTool tool to run it in Node.`,
      );
    return executeTool(name, input, { signal });
  }
  try {
    const output = await tool.run(input, { signal: signal ?? new AbortController().signal, source: "test" });
    return toToolResult(output);
  } catch (err) {
    return failure(err);
  }
}

/** The tool definition {@link mockTool} registers, minus `execute`. */
export interface MockToolDefinition {
  /** Default `"Mock tool <name>."`. */
  description?: string;
  /** Default `{ type: "object", properties: {} }`: any input. */
  inputSchema?: JSONSchema;
  /** WebMCP annotations, e.g. `{ readOnlyHint: true }`. */
  annotations?: ModelContextToolInfo["annotations"];
}

/** What a mocked tool's implementation gets and may return (a string, a value, or an MCP result). */
export type MockToolImpl = (input: Record<string, unknown>, options: { signal: AbortSignal }) => unknown;

/** A page tool backed by a `vi.fn`: every Vitest spy matcher and `mockResolvedValueOnce` work on it. */
export type MockedTool = Mock<MockToolImpl> & {
  /** The registered name. */
  readonly toolName: string;
  /** Take the tool off the page. Idempotent; `tools.mock` does it after the test. */
  unregister(): void;
};

/**
 * Register a page tool whose `execute` is a `vi.fn` (default: resolves `"ok"`). Returns the spy. Unregister it with
 * `unregister()`, or use the `tools` fixture's `tools.mock`, which does it after the test.
 *
 * @example
 * const add = mockTool("add_to_cart", async ({ qty }) => `Added ${qty}`);
 * await callTool("add_to_cart", { qty: 2 });
 * expect(add).toHaveBeenCalledWith({ qty: 2 }, expect.anything());
 */
export function mockTool(name: string, impl?: MockToolImpl): MockedTool;
export function mockTool(name: string, definition: MockToolDefinition, impl?: MockToolImpl): MockedTool;
export function mockTool(name: string, a?: MockToolDefinition | MockToolImpl, b?: MockToolImpl): MockedTool {
  if (typeof name !== "string" || !name)
    throw new TypeError('mockTool() needs the tool\'s name first, e.g. mockTool("add_to_cart", impl).');
  const definition = typeof a === "function" ? {} : (a ?? {});
  const impl = (typeof a === "function" ? a : b) ?? (async () => "ok");
  const spy = vi.fn(impl).mockName(name);
  const controller = new AbortController();
  modelContext().registerTool(
    {
      name,
      description: definition.description ?? `Mock tool ${name}.`,
      inputSchema: definition.inputSchema ?? { type: "object", properties: {} },
      ...(definition.annotations ? { annotations: definition.annotations } : {}),
      execute: async (input: Record<string, unknown>, options: { signal: AbortSignal }) => spy(input, options),
    },
    { signal: controller.signal },
  );
  return Object.assign(spy, {
    toolName: name,
    // Only this registration: aborting its signal leaves a newer tool of the same name alone.
    unregister: () => controller.abort(),
  });
}
