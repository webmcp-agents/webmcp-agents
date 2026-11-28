/**
 * Chat sessions: a random id the server hands the page in an httpOnly cookie, signed so the server needs no store.
 *
 * The cloud adapter's first request is a GET (is chat configured?); that GET sets the cookie, and every POST must
 * carry it. What it buys: a POST needs a cookie this server issued (a bare `curl -X POST` gets 401), every request
 * belongs to a session that can be counted and limited (`beforeModel`'s `session`), and `verify` is the one place a
 * bot check (Turnstile, BotID) gates new sessions. What it can't do alone: prove the caller is the page. A script that
 * keeps cookies can GET first; only `verify` makes starting a session cost a real browser.
 *
 * Token: `v1.<id>.<expires>.<born>.<sig>`: 128 random bits, expiry and birth in base-36 seconds, HMAC-SHA256 over the
 * rest. Web Crypto only, so it runs in Node 22+, edge runtimes and `vite dev`.
 */

import type { Redactor } from "@webmcp-agents/core/redact";
import { type TurnstileOptions, turnstileVerify } from "./turnstile";

/** Options for chat sessions (`createChatHandler({ session })`). */
export interface ChatSessionOptions {
  /**
   * The HMAC key, at least 32 characters. Every server instance must share it (serverless functions are many
   * instances): set `WEB_AGENTS_SESSION_SECRET`. Default: that variable from the handler's `env`, else a random key per
   * process, fine for one dev server, not for a deployment (a token from one instance fails on the next, and the
   * adapter has to start a new session).
   */
  secret?: string;
  /** Seconds a session lives without a request; each POST past half of it extends it. Default 1800 (30 min). */
  ttl?: number;
  /** Seconds after which a session is not extended any more, so the page starts a new one. Default 86400 (a day). */
  maxAge?: number;
  /** The cookie's name. Default `"web_agents_session"`. */
  cookie?: string;
  /**
   * Decide whether this GET may start a session: a bot check (Cloudflare Turnstile, Vercel BotID). Return false and
   * no cookie is set: the page's POSTs get 401 `session_required`. Default: every GET that finds chat enabled.
   */
  verify?: (req: Request) => boolean | Promise<boolean>;
  /**
   * Require a solved Cloudflare Turnstile challenge to start a session: `true` (secret from `TURNSTILE_SECRET_KEY`) or
   * `TurnstileOptions`. The page sends the token with `createCloudAdapter({ sessionHeaders: turnstileHeaders(…) })`.
   * With `verify` too, both must pass. Default off.
   */
  turnstile?: boolean | TurnstileOptions;
}

/** A session read from a request: its id, and whether the cookie should be renewed on this response. */
export interface ChatSession {
  /** 22 characters of base64url, random per session: key per-session limits on it. */
  id: string;
  expires: number;
  born: number;
}

const DEFAULT_COOKIE = "web_agents_session";
const MIN_SECRET = 32;
const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array): string => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const now = (): number => Math.floor(Date.now() / 1000);

/** Constant-time string comparison (same length checked first; the length of a signature is public). */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The value of one cookie in a `Cookie` header. */
export function readCookie(req: Request, name: string): string | undefined {
  for (const pair of (req.headers.get("cookie") ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at !== -1 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return undefined;
}

/** Issues and checks session tokens. Created once per handler. */
export interface SessionKeeper {
  /** The session the request carries, or undefined when it has none, a forged one, or an expired one. */
  read(req: Request): Promise<ChatSession | undefined>;
  /** A `Set-Cookie` value for a new session, or for `renew` of an existing one. Undefined when `verify` refused. */
  issue(req: Request, renew?: ChatSession): Promise<string | undefined>;
  /** True when this session's cookie should be renewed on the response (past half its ttl, not past maxAge). */
  due(session: ChatSession): boolean;
}

/** Make a `SessionKeeper`. Throws when `secret` is shorter than 32 characters (a typo'd env var fails loudly). */
export function createSessionKeeper(
  options: ChatSessionOptions,
  env: Record<string, string | undefined>,
  redact?: Redactor,
): SessionKeeper {
  const ttl = options.ttl ?? 1800;
  const maxAge = options.maxAge ?? 86_400;
  const name = options.cookie ?? DEFAULT_COOKIE;
  const configured = options.secret ?? env.WEB_AGENTS_SESSION_SECRET;
  if (configured !== undefined && configured.length < MIN_SECRET) {
    throw new TypeError(`[web-agents/chat] the session secret must be at least ${MIN_SECRET} characters (WEB_AGENTS_SESSION_SECRET).`);
  }
  const turnstile = options.turnstile ? turnstileVerify(options.turnstile === true ? {} : options.turnstile, env, redact) : undefined;
  const allowed = async (req: Request): Promise<boolean> =>
    (!options.verify || (await options.verify(req))) && (!turnstile || (await turnstile(req)));
  // no secret configured: one random key for this process (dev, a single server)
  const secret = configured ?? base64url(crypto.getRandomValues(new Uint8Array(32)));
  let key: Promise<CryptoKey> | undefined;
  const sign = async (payload: string): Promise<string> => {
    key ??= crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await key, encoder.encode(payload))));
  };

  const cookie = (req: Request, token: string): string => {
    const url = new URL(req.url);
    // Secure only over https: browsers drop Secure cookies set from plain http (a LAN dev server)
    const secure = url.protocol === "https:" ? "; Secure" : "";
    return `${name}=${token}; Path=${url.pathname}; Max-Age=${ttl}; HttpOnly; SameSite=Strict${secure}`;
  };

  return {
    async read(req) {
      const token = readCookie(req, name);
      const parts = token?.split(".");
      if (parts?.length !== 5 || parts[0] !== "v1") return undefined;
      const [, id, exp, born, sig] = parts as [string, string, string, string, string];
      if (!same(sig, await sign(`v1.${id}.${exp}.${born}`))) return undefined;
      const session = { id, expires: Number.parseInt(exp, 36), born: Number.parseInt(born, 36) };
      return session.expires > now() ? session : undefined;
    },
    async issue(req, renew) {
      if (!renew && !(await allowed(req))) return undefined;
      const id = renew?.id ?? base64url(crypto.getRandomValues(new Uint8Array(16)));
      const born = renew?.born ?? now();
      const payload = `v1.${id}.${(now() + ttl).toString(36)}.${born.toString(36)}`;
      return cookie(req, `${payload}.${await sign(payload)}`);
    },
    due(session) {
      return session.expires - now() < ttl / 2 && now() - session.born < maxAge;
    },
  };
}
