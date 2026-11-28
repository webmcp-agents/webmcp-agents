import type { StepInput } from "../script";
import { requirePeer } from "../peer";

/** Options for {@link mockChatServer}. */
export interface MockChatServerOptions {
  /** The model's steps, one per request (the last repeats). */
  steps: StepInput[];
  /** Require a chat session, as `createChatHandler({ session })`. Default false. */
  session?: boolean;
  /** Any other `createChatHandler` option (`agents`, `tools`, `maxSteps`, `beforeModel`…). */
  handler?: Record<string, unknown>;
}

/** A request the server received. */
export interface MockChatServerRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** The parsed JSON body (`messages`, `tools`, `agent`, `trace`…); undefined for a GET. */
  body: Record<string, unknown> | undefined;
}

/** A canned answer for {@link MockChatServer.respondOnce}. */
export interface CannedResponse {
  status: number;
  headers?: Record<string, string>;
  /** JSON body. Default `{ error, message }` for the status (429 `rate_limited`, 401 `session_required`…). */
  body?: unknown;
}

/** An in-memory `/api/chat`: the real handler on a scripted model, behind a `fetch` with a cookie jar. */
export interface MockChatServer {
  /** Give it to `createCloudAdapter({ fetch })`. */
  fetch: typeof fetch;
  /** Every request, in order. */
  readonly requests: MockChatServerRequest[];
  /** Answer the next request with `response` instead of the handler (once; queued in order). */
  respondOnce(response: CannedResponse | Response): void;
}

const ERRORS: Record<number, { error: string; message: string }> = {
  401: { error: "session_required", message: "No chat session: GET this endpoint first (the page does)." },
  403: { error: "forbidden", message: "Cross-site requests are not allowed." },
  429: { error: "rate_limited", message: "Too many requests: try again in a minute." },
  503: { error: "chat_disabled", message: "Chat is not configured on the server." },
};

const toResponse = (canned: CannedResponse | Response): Response =>
  canned instanceof Response
    ? canned
    : new Response(JSON.stringify(canned.body ?? ERRORS[canned.status] ?? { error: "error", message: `Status ${canned.status}.` }), {
        status: canned.status,
        headers: { "content-type": "application/json", ...canned.headers },
      });

/**
 * A fake `/api/chat` for the real cloud adapter: the real `createChatHandler` on `mockModel(steps)`, reached
 * through `fetch` in memory. It records every request and keeps the session cookie like a browser. Needs
 * `@webmcp-agents/chat` and `ai`, loaded on the first request.
 *
 * @example
 * const server = mockChatServer({ steps: [toolCall("add_to_cart", { qty: 1 }), text("Added.")], session: true });
 * const cloud = createCloudAdapter({ fetch: server.fetch });
 * server.respondOnce({ status: 429, headers: { "retry-after": "30" } });
 */
export function mockChatServer(options: MockChatServerOptions): MockChatServer {
  if (!options || !Array.isArray(options.steps))
    throw new TypeError('mockChatServer() needs { steps: [...] }, e.g. { steps: [text("Hi.")] }.');
  const requests: MockChatServerRequest[] = [];
  const queue: (CannedResponse | Response)[] = [];
  let cookie: string | undefined;
  let handler: Promise<(req: Request) => Promise<Response>> | undefined;

  const load = async () => {
    const [{ createChatHandler }, { mockModel }] = await Promise.all([
      requirePeer(() => import("@webmcp-agents/chat/server"), { peer: "@webmcp-agents/chat", by: "mockChatServer()" }),
      import("../server/index"),
    ]);
    return createChatHandler({ ...options.handler, model: mockModel(options.steps), session: options.session ?? false } as never) as (
      req: Request,
    ) => Promise<Response>;
  };

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(
      new URL(input instanceof Request ? input.url : String(input), "http://localhost"),
      input instanceof Request ? input : init,
    );
    const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.clone().text();
    let body: Record<string, unknown> | undefined;
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
    } catch {
      body = { raw: text };
    }
    // the cookie jar: what a browser would send
    const headers = new Headers(req.headers);
    if (cookie && !headers.has("cookie")) headers.set("cookie", cookie);
    requests.push({ method: req.method, url: req.url, headers: Object.fromEntries(headers), body });
    const canned = queue.shift();
    if (canned) return toResponse(canned);
    handler ??= load();
    const res = await (await handler)(new Request(req, { headers }));
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  }) as typeof fetch;

  return {
    fetch: fakeFetch,
    requests,
    respondOnce(response) {
      queue.push(response);
    },
  };
}
