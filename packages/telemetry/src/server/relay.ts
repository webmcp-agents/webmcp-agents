/**
 * The relay (design §7.6): the app's own endpoint for the browser's spans, so no backend key reaches the page. The
 * browser is not trusted: same-site requests only, a size cap, OTLP JSON from this package's scope only, every value
 * redacted again, the server's sampling (never the browser's flag). Spans then go through the same pipeline as the
 * server's. It answers `202` with no body whatever happens upstream, and a refusal carries no detail.
 */
import { isCrossSite } from "@webmcp-agents/chat/server";
import { SCOPE_NAME } from "../semconv";
import type { Attributes } from "../shared/types";
import { cleanAttributes } from "../shared/util";
import type { Log } from "./log";
import type { RelaySpan, Runtime } from "./runtime";
import type { TelemetryRelayOptions } from "./types";

/** The relay's default body cap: 256 KB. */
export const RELAY_MAX_BYTES = 256 * 1024;
/** Spans accepted in one request; more is refused as malformed. */
const MAX_SPANS = 2048;
/** Attributes kept per span or event. */
const MAX_ATTRIBUTES = 128;

const empty = (status: number, headers: Record<string, string> = {}): Response =>
  new Response(null, { status, headers: { "cache-control": "no-store", ...headers } });

/** The body as text, or null once it passes `limit` bytes (the rest is never read). */
async function readCapped(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
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

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** An OTLP JSON `AnyValue` as an attribute value (scalars and arrays of scalars only), else undefined. */
function value(v: unknown, depth = 0): unknown {
  if (!isObject(v)) return undefined;
  if (typeof v.stringValue === "string") return v.stringValue;
  if (typeof v.boolValue === "boolean") return v.boolValue;
  if (typeof v.doubleValue === "number") return v.doubleValue;
  if (typeof v.intValue === "number" || typeof v.intValue === "string") {
    const n = Number(v.intValue);
    return Number.isSafeInteger(n) ? n : String(v.intValue);
  }
  if (depth === 0 && isObject(v.arrayValue) && Array.isArray(v.arrayValue.values)) return v.arrayValue.values.map((x) => value(x, 1));
  return undefined;
}

/** OTLP JSON `KeyValue`s as attributes (at most {@link MAX_ATTRIBUTES}). */
const attributesOf = (list: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(list)) return out;
  for (const kv of list.slice(0, MAX_ATTRIBUTES)) if (isObject(kv) && typeof kv.key === "string" && kv.key) out[kv.key] = value(kv.value);
  return out;
};

/** A unix-nanosecond string or number as `[s, ns]`, or undefined. */
const hrTime = (v: unknown): [number, number] | undefined => {
  const s = typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)) : typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,21}$/.test(s)) return undefined;
  const n = BigInt(s);
  return [Number(n / 1_000_000_000n), Number(n % 1_000_000_000n)];
};

/** Why a body was refused. */
type Refusal = "malformed" | "foreign-scope";

/** The browser's OTLP JSON as relay spans, redacted (`finalize`, `text`), or why it was refused. */
export function decodeBrowserSpans(
  body: unknown,
  finalize: (a: Readonly<Record<string, unknown>>) => Attributes,
  text: (s: string) => string,
): RelaySpan[] | Refusal {
  if (!isObject(body) || !Array.isArray(body.resourceSpans)) return "malformed";
  const out: RelaySpan[] = [];
  for (const rs of body.resourceSpans) {
    if (!isObject(rs) || !Array.isArray(rs.scopeSpans)) return "malformed";
    for (const ss of rs.scopeSpans) {
      if (!isObject(ss) || !Array.isArray(ss.spans)) return "malformed";
      if (!isObject(ss.scope) || ss.scope.name !== SCOPE_NAME) return "foreign-scope";
      for (const s of ss.spans) {
        if (out.length >= MAX_SPANS || !isObject(s)) return "malformed";
        const traceId = typeof s.traceId === "string" ? s.traceId.toLowerCase() : "";
        const spanId = typeof s.spanId === "string" ? s.spanId.toLowerCase() : "";
        const parent = typeof s.parentSpanId === "string" && s.parentSpanId ? s.parentSpanId.toLowerCase() : undefined;
        const start = hrTime(s.startTimeUnixNano);
        const end = hrTime(s.endTimeUnixNano);
        if (!/^[0-9a-f]{32}$/.test(traceId) || /^0+$/.test(traceId) || !/^[0-9a-f]{16}$/.test(spanId) || /^0+$/.test(spanId))
          return "malformed";
        if ((parent && !/^[0-9a-f]{16}$/.test(parent)) || typeof s.name !== "string" || !s.name || s.name.length > 512 || !start || !end)
          return "malformed";
        const status = isObject(s.status) ? s.status : {};
        const code = status.code === 1 || status.code === 2 ? status.code : 0;
        out.push({
          traceId,
          spanId,
          ...(parent && { parentSpanId: parent }),
          name: text(s.name),
          kind: typeof s.kind === "number" && s.kind >= 1 && s.kind <= 5 ? s.kind - 1 : 0,
          startTime: start,
          endTime: end,
          attributes: finalize(attributesOf(s.attributes)),
          events: (Array.isArray(s.events) ? s.events.slice(0, MAX_ATTRIBUTES) : []).flatMap((e) => {
            const time = isObject(e) ? hrTime(e.timeUnixNano) : undefined;
            return isObject(e) && typeof e.name === "string" && time
              ? [{ name: text(e.name), time, attributes: finalize(attributesOf(e.attributes)) }]
              : [];
          }),
          status: { code, ...(typeof status.message === "string" && status.message && { message: text(status.message) }) },
        });
      }
    }
  }
  return out;
}

/** What the relay needs from the layer that owns it. */
export interface RelayHost {
  /** The built layer, or null when telemetry is off (including `OTEL_SDK_DISABLED`). */
  runtime(): Promise<Runtime | null>;
  /** Redact free text. */
  text(value: string): string;
  /** Send what is buffered (never rejects). */
  flush(): Promise<void>;
  log: Log;
}

const VERCEL_CONTEXT = Symbol.for("@vercel/request-context");

/** The host's `waitUntil`: on an argument after the request (a Worker's `ctx`), else Vercel's request context. */
function findWaitUntil(args: readonly unknown[]): ((p: Promise<unknown>) => void) | undefined {
  for (const arg of args) {
    const fn = (arg as { waitUntil?: unknown } | null)?.waitUntil;
    if (typeof fn === "function") return fn.bind(arg) as (p: Promise<unknown>) => void;
  }
  try {
    const fn = (globalThis as { [VERCEL_CONTEXT]?: { get?: () => { waitUntil?: unknown } | undefined } })[VERCEL_CONTEXT]?.get?.()
      ?.waitUntil;
    return typeof fn === "function" ? (fn as (p: Promise<unknown>) => void) : undefined;
  } catch {
    return undefined;
  }
}

/** The relay's `POST` handler (see the module comment for every rule). */
export function createRelay(
  layer: RelayHost,
  options: TelemetryRelayOptions = {},
): (req: Request, ...host: unknown[]) => Promise<Response> {
  const maxBytes = options.maxBytes && options.maxBytes > 0 ? options.maxBytes : RELAY_MAX_BYTES;
  return async (req, ...rest) => {
    try {
      // ---------- 1. who may post ----------
      if (req.method !== "POST") return empty(405, { allow: "POST" });
      if (isCrossSite(req)) return empty(403);
      if (options.guard) {
        let refused: Response | undefined;
        try {
          refused = await options.guard(req);
        } catch (err) {
          layer.log.error("relay-guard", "the relay's guard threw: the request was refused", err);
          return empty(500);
        }
        if (refused) return refused;
      }
      // ---------- 2. what may be posted ----------
      if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return empty(415);
      const raw = await readCapped(req, maxBytes);
      if (raw === null) return empty(413);
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return empty(400);
      }
      // ---------- 3. forward (off: accepted and dropped) ----------
      const rt = await layer.runtime();
      if (!rt) return empty(202);
      const spans = decodeBrowserSpans(body, rt.finalize, layer.text);
      if (!Array.isArray(spans)) return empty(400);
      let extra: Record<string, string> = {};
      try {
        extra = cleanAttributes(options.attributes?.(req)) as Record<string, string>;
      } catch (err) {
        layer.log.error("relay-attributes", "the relay's attributes() threw: spans were forwarded without them", err);
      }
      try {
        rt.relay(spans, extra, req);
        // serverless: keep the function alive until the batch is sent, without holding the response for it
        findWaitUntil(rest)?.(layer.flush());
      } catch (err) {
        layer.log.error("relay-forward", "relayed spans could not be forwarded", err);
      }
      return empty(202);
    } catch (err) {
      layer.log.error("relay", "the relay failed on a request", err);
      return empty(400);
    }
  };
}
