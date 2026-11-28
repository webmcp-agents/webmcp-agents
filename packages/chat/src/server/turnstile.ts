/**
 * Cloudflare Turnstile as the gate on new chat sessions (`createChatHandler({ session: { turnstile } })`).
 *
 * The page solves an invisible Turnstile challenge only when it needs a session (`turnstileHeaders` on the cloud
 * adapter), and sends the token on that one GET; the server checks it with Cloudflare's siteverify before it sets the
 * session cookie. A token is single-use and lives 300 s, so it starts exactly one session. Fails closed: no token, a
 * network error, a timeout or a non-success answer start no session.
 */
import { getRedactor, type Redactor } from "@webmcp-agents/core/redact";

/** Options for `turnstileVerify` (and `session.turnstile`). */
export interface TurnstileOptions {
  /** The widget's secret key. Default: `TURNSTILE_SECRET_KEY` from the handler's env. */
  secret?: string;
  /** The request header carrying the token. Default `"x-turnstile-token"` (what `turnstileHeaders` sends). */
  header?: string;
  /** Accept only tokens solved on these hostnames (the answer's `hostname`). Default: any hostname of the widget. */
  hostname?: string | readonly string[];
  /** Accept only tokens rendered with this action. Default: any (`turnstileHeaders` sends `"web_agents_chat"`). */
  action?: string;
  /** Milliseconds to wait for siteverify before refusing. Default 5000. */
  timeout?: number;
  /** Injectable for tests. Default `globalThis.fetch`. */
  fetch?: typeof fetch;
}

/** Cloudflare's verification endpoint. */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The header `turnstileHeaders` sends and `turnstileVerify` reads. */
export const TURNSTILE_HEADER = "x-turnstile-token";

/** What siteverify answers (the fields read here). */
interface SiteverifyAnswer {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

/**
 * A `session.verify` that accepts a GET carrying a valid Turnstile token. Throws when no secret is given or found in
 * `env` (a deployment that meant to require Turnstile must not start without it). A failed check is logged through
 * `redact` (default: the process's redactor, `getRedactor()`), since a network error can echo the request.
 */
export function turnstileVerify(
  options: TurnstileOptions = {},
  env: Record<string, string | undefined> = {},
  redact?: Redactor,
): (req: Request) => Promise<boolean> {
  const secret = options.secret ?? env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new TypeError("[web-agents/chat] Turnstile needs its secret key: set TURNSTILE_SECRET_KEY on the server.");
  const header = options.header ?? TURNSTILE_HEADER;
  const hostnames =
    options.hostname === undefined ? undefined : new Set(typeof options.hostname === "string" ? [options.hostname] : options.hostname);
  const doFetch = options.fetch ?? globalThis.fetch;
  return async (req) => {
    const token = req.headers.get(header);
    // no token, no call to Cloudflare: the page's plain availability check costs nothing
    if (!token || token.length > 2048) return false;
    try {
      const res = await doFetch(TURNSTILE_VERIFY_URL, {
        method: "POST",
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(options.timeout ?? 5000),
      });
      const answer = (await res.json()) as SiteverifyAnswer;
      if (answer.success !== true) return false;
      if (hostnames && !hostnames.has(answer.hostname ?? "")) return false;
      if (options.action !== undefined && answer.action !== options.action) return false;
      return true;
    } catch (err) {
      console.warn("[web-agents/chat] Turnstile verification failed:", (redact ?? getRedactor()).error(err));
      return false;
    }
  };
}
