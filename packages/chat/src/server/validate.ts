/**
 * The request body, checked before anything reaches the model: counts, sizes
 * and names are capped so a page (or anyone calling the endpoint) can't send
 * an unbounded prompt.
 */
import { z } from "zod";
import { AGENT_ID } from "../agent";
import { LIMITS } from "../shared";

export { LIMITS };

const TOOL_NAME = /^[a-zA-Z0-9_.-]{1,128}$/;

const providerMetadata = z
  .record(z.string(), z.record(z.string(), z.unknown()))
  .refine((m) => JSON.stringify(m).length <= LIMITS.reasoning, "Provider metadata is too large");

const toolOutput = z.object({
  content: z.array(z.object({ type: z.string() }).loose()).max(20),
  isError: z.boolean().optional(),
});

const part = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(LIMITS.text) }),
  z.object({
    type: z.literal("reasoning"),
    text: z.string().max(LIMITS.reasoning),
    providerMetadata: providerMetadata.optional(),
  }),
  z.object({
    type: z.literal("tool"),
    id: z.string().min(1).max(128),
    name: z.string().regex(TOOL_NAME),
    input: z.unknown(),
    state: z.enum(["running", "awaiting-confirmation", "done", "error", "cancelled"]),
    output: toolOutput.optional(),
    error: z.string().max(LIMITS.text).optional(),
    prompt: z.string().max(LIMITS.text).optional(),
    providerMetadata: providerMetadata.optional(),
  }),
]);

const message = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(["user", "assistant"]),
  parts: z.array(part).max(LIMITS.parts),
});

const tool = z.object({
  name: z.string().regex(TOOL_NAME, "Tool names are 1-128 letters, digits, _ . or -"),
  description: z.string().max(LIMITS.description),
  inputSchema: z
    .record(z.string(), z.unknown())
    .refine((s) => JSON.stringify(s).length <= LIMITS.schemaBytes, `Input schemas are at most ${LIMITS.schemaBytes} bytes`),
});

/** The ids the page may send in `trace`: 1 to 64 letters, digits, `_`, `.` or `-` (a UUID fits). */
export const TRACE_ID = /^[a-zA-Z0-9_.-]{1,64}$/;

/**
 * The run's ids a 0.5.0 page sends with every step (`trace`). Optional: a 0.4.0 page sends none, and a 0.4.0 server
 * strips the field (the schema is not strict). Invalid ids refuse the request (400) before any model call.
 */
export const chatTraceSchema = z.object({
  /** The conversation: every turn of one chat. */
  conversation: z.string().regex(TRACE_ID, "Trace ids are 1-64 letters, digits, _ . or -"),
  /** The run: one user turn (or one sub-agent run). */
  run: z.string().regex(TRACE_ID, "Trace ids are 1-64 letters, digits, _ . or -"),
  /** The model step within the run, from 1. */
  step: z.number().int().min(1).max(64),
  /** For a sub-agent's run: the `delegate_to_*` call id that started it. */
  parent: z.string().regex(TRACE_ID, "Trace ids are 1-64 letters, digits, _ . or -").optional(),
});

/** The POST body of /api/chat. */
export const chatRequestSchema = z.object({
  messages: z.array(message).min(1).max(LIMITS.messages),
  tools: z
    .array(tool)
    .max(LIMITS.tools)
    .refine((ts) => new Set(ts.map((t) => t.name)).size === ts.length, "Tool names must be unique"),
  /** Where the conversation happens (the page's URL). Only a same-origin path reaches the model. */
  page: z.object({ url: z.string().max(2000).optional() }).optional(),
  /** The agent's id (`defineWebAgent`), looked up in the handler's registry. Never instructions: unknown keys are stripped. */
  agent: z.string().regex(AGENT_ID, "Agent ids are 1-64 letters, digits, _ . or -").optional(),
  /** The run's ids, for telemetry (0.5.0): see `chatTraceSchema`. */
  trace: chatTraceSchema.optional(),
});

/** A validated /api/chat request. */
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** `$schema` / `$id` out, `type: "object"` at the root (what tool input schemas must be). */
export function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _s, $id: _i, ...rest } = schema;
  return { ...rest, type: "object", properties: rest.properties ?? {} };
}

/** Control characters (but tabs and newlines) out of page-supplied text. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
export const cleanText = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

/**
 * The page's path, only from a browser request on the same origin (Origin header present and matching). Just the
 * path: a title or query is free text the page (or its users) control, and has no place in the system prompt.
 */
export function samePagePath(url: string | undefined, origin: string | null): string | undefined {
  if (!url || !origin) return undefined;
  try {
    const u = new URL(url);
    return u.origin === origin ? u.pathname.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The body as text, read up to `limit` bytes. Null when it's larger: counting while streaming means a body without
 * Content-Length (chunked) is never buffered past the cap.
 */
export async function readCappedText(req: Request, limit: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * A browser request from another site (Origin present and different from the endpoint's own). Such requests are
 * refused: no other site may spend this server's model budget through a visitor's browser (CSRF), in dev or in
 * production. Requests without Origin (curl, server-to-server) pass; rate limiting them is `guard`'s job.
 */
export function isCrossSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return origin !== new URL(req.url).origin;
  } catch {
    return true;
  }
}
