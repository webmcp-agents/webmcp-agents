/** Building `/api/chat` requests and reading its answers, for tests of `createChatHandler`. */
import type { AgentMessage, ToolDescriptor } from "@webmcp-agents/chat";
import { nextId } from "../ids";

/** The default endpoint URL: the handler only checks that an `Origin` header, when sent, matches it. */
export const CHAT_URL = "http://localhost/api/chat";

/** What {@link chatRequest} puts in the body. */
export interface ChatRequestBody {
  /** The conversation: plain strings become user messages. */
  messages: (string | AgentMessage)[];
  /** The tools the page offers: names become minimal descriptors (any input). Default none. */
  tools?: (string | ToolDescriptor)[];
  /** The agent's id (`defineWebAgent`), when the page runs one. */
  agent?: string;
  /** Anything else the body carries (`page`, `model`, `trace`…). */
  [key: string]: unknown;
}

/** How {@link chatRequest} sends it. */
export interface ChatRequestOptions {
  /** The `Origin` header. Default none (a same-site request); another site's origin gets `403`. */
  origin?: string;
  /** More headers (`cookie`, `cf-turnstile-response`…). */
  headers?: Record<string, string>;
  /** The URL. Default `http://localhost/api/chat`. */
  url?: string;
}

const descriptor = (tool: string | ToolDescriptor): ToolDescriptor =>
  typeof tool === "string" ? { name: tool, description: `The ${tool} tool.`, inputSchema: { type: "object", properties: {} } } : tool;

const message = (m: string | AgentMessage): AgentMessage =>
  typeof m === "string" ? { id: nextId("u"), role: "user", parts: [{ type: "text", text: m }] } : m;

/**
 * A `POST /api/chat` request as the cloud adapter sends it.
 *
 * @example
 * const res = await handler(chatRequest({ messages: ["Add a mug"], tools: ["add_to_cart"] }));
 * const refused = await handler(chatRequest({ messages: ["hi"] }, { origin: "https://evil.example" }));   // 403
 */
export function chatRequest(body: ChatRequestBody, options: ChatRequestOptions = {}): Request {
  if (!body || !Array.isArray(body.messages))
    throw new TypeError('chatRequest() needs { messages: [...] }, e.g. chatRequest({ messages: ["hi"] }).');
  const { messages, tools = [], ...rest } = body;
  return new Request(options.url ?? CHAT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.origin ? { origin: options.origin } : {}), ...options.headers },
    body: JSON.stringify({ ...rest, messages: messages.map(message), tools: tools.map(descriptor) }),
  });
}

/** One part of the handler's answer, read from its UI message stream. */
export type ChatStreamPart =
  | { type: "text-delta"; delta: string; chunk: Record<string, unknown> }
  | { type: "reasoning"; text: string; chunk: Record<string, unknown> }
  | { type: "tool-call"; id: string; name: string; input: unknown; chunk: Record<string, unknown> }
  | { type: "error"; error: string; chunk: Record<string, unknown> }
  | { type: "finish"; reason?: string; chunk: Record<string, unknown> }
  | { type: "other"; chunk: Record<string, unknown> };

/** Map one AI SDK UI message chunk to a {@link ChatStreamPart}. */
function partOf(chunk: Record<string, unknown>): ChatStreamPart {
  switch (chunk.type) {
    case "text-delta":
      return { type: "text-delta", delta: String(chunk.delta ?? ""), chunk };
    case "reasoning-delta":
      return { type: "reasoning", text: String(chunk.delta ?? ""), chunk };
    case "tool-input-available":
      return { type: "tool-call", id: String(chunk.toolCallId), name: String(chunk.toolName), input: chunk.input, chunk };
    case "error":
      return { type: "error", error: String(chunk.errorText ?? ""), chunk };
    case "finish":
      return { type: "finish", ...(typeof chunk.finishReason === "string" ? { reason: chunk.finishReason } : {}), chunk };
    default:
      return { type: "other", chunk };
  }
}

/**
 * Read a chat handler's streamed answer to the end: the parts, in order (`text-delta`, `reasoning`, `tool-call`,
 * `error`, `finish`; anything else as `other`). Each keeps the raw chunk. Rejects with a sentence when the response
 * is not a stream (an error status: its JSON is in the message).
 *
 * @example
 * const parts = await readChatStream(await handler(chatRequest({ messages: ["hi"], tools: ["add_to_cart"] })));
 * expect(parts).toContainEqual(expect.objectContaining({ type: "tool-call", name: "add_to_cart" }));
 */
export async function readChatStream(response: Response): Promise<ChatStreamPart[]> {
  if (!(response instanceof Response)) throw new TypeError("readChatStream() takes the Response the handler returned.");
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`readChatStream(): the handler answered ${response.status}, not a stream. Body: ${text.slice(0, 300)}`);
  }
  const text = await response.text();
  const parts: ChatStreamPart[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      parts.push(partOf(JSON.parse(data) as Record<string, unknown>));
    } catch {
      parts.push({ type: "other", chunk: { raw: data } });
    }
  }
  return parts;
}

/** A handler: `(req) => Response`. */
export type ChatHandler = (req: Request) => Response | Promise<Response>;

/**
 * Start a chat session the way the page does (a `GET` first, which sets the session cookie), and return a `send`
 * that carries the cookie on every request (and keeps a renewed one). Rejects with a sentence when the GET set no
 * cookie (sessions off, or chat disabled).
 *
 * @example
 * const send = await withSession(createChatHandler({ model, session: true }));
 * const res = await send(chatRequest({ messages: ["hi"] }));
 */
export async function withSession(handler: ChatHandler, options: { url?: string } = {}): Promise<ChatHandler> {
  const url = options.url ?? CHAT_URL;
  const first = await handler(new Request(url));
  let cookie = cookieOf(first);
  if (!cookie) {
    throw new Error(
      `withSession(): GET ${url} set no session cookie (status ${first.status}). Create the handler with { session: true } and a model.`,
    );
  }
  return async (req) => {
    const headers = new Headers(req.headers);
    headers.set("cookie", cookie!);
    const res = await handler(new Request(req, { headers }));
    cookie = cookieOf(res) ?? cookie;
    return res;
  };
}

/** `name=value` of the response's first `Set-Cookie`, or undefined. */
function cookieOf(res: Response): string | undefined {
  const set = res.headers.get("set-cookie");
  return set ? set.split(";")[0] : undefined;
}
