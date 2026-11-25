/**
 * Small pieces both entries use: OTLP JSON values, ids, sampling, and the OpenTelemetry API's global registry read
 * without importing the API.
 */
import type { Redactor } from "@webmcp-agents/core/redact";
import type { Attributes, AttributeValue, Sampling, SamplingContext } from "./types";

/** This package's version, on every span's instrumentation scope. Kept in step with package.json by the release. */
export const VERSION = "0.4.0";

/** An OTLP JSON `AnyValue`. */
type AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: number }
  | { doubleValue: number }
  | { arrayValue: { values: AnyValue[] } };

const anyValue = (v: AttributeValue | string | number | boolean): AnyValue =>
  typeof v === "string"
    ? { stringValue: v }
    : typeof v === "boolean"
      ? { boolValue: v }
      : typeof v === "number"
        ? Number.isInteger(v)
          ? { intValue: v }
          : { doubleValue: v }
        : { arrayValue: { values: (v as readonly (string | number | boolean)[]).map(anyValue) } };

/** OTLP JSON `KeyValue`s from attributes (values that are not attribute values are left out). */
export const keyValues = (attributes: Readonly<Record<string, unknown>> = {}): { key: string; value: AnyValue }[] =>
  Object.entries(attributes)
    .filter(([, v]) => isAttributeValue(v))
    .map(([key, v]) => ({ key, value: anyValue(v as AttributeValue) }));

const scalar = (v: unknown): boolean => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/** A value OpenTelemetry accepts as an attribute: a string, finite number, boolean, or an array of one of those. */
export const isAttributeValue = (v: unknown): v is AttributeValue => scalar(v) || (Array.isArray(v) && v.every(scalar));

/** Keep only attribute values. */
export const cleanAttributes = (value: Readonly<Record<string, unknown>> | undefined): Attributes => {
  const out: Attributes = {};
  for (const [k, v] of Object.entries(value ?? {})) if (isAttributeValue(v)) out[k] = v;
  return out;
};

/** `n` random bytes as lowercase hex (a trace id is 16, a span id 8). */
export const randomHex = (n: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");

/** `[trace id, span id]` of a W3C `traceparent` (`00-<32 hex>-<16 hex>-<2 hex>`), or undefined when it is not one. */
export const parseTraceparent = (header: string | null | undefined): [string, string] | undefined => {
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(header?.trim().toLowerCase() ?? "");
  return m && !/^0+$/.test(m[1]!) && !/^0+$/.test(m[2]!) ? [m[1]!, m[2]!] : undefined;
};

/**
 * Whether a trace is kept. `ratio` reads the trace id's last 8 hex digits (random in any W3C id), so every span of one
 * trace gets the same answer on the browser and the server; without an id it draws at random. A throwing `custom`
 * sampler drops the trace.
 */
export function isSampled(sampling: Sampling | undefined, traceId: string | undefined, ctx: SamplingContext): boolean {
  if (!sampling || sampling.type === "always") return true;
  if (sampling.type === "never") return false;
  if (sampling.type === "ratio") {
    const p = sampling.probability;
    if (!(p > 0)) return false;
    if (p >= 1) return true;
    const draw = traceId && /^[0-9a-f]{8,}$/i.test(traceId) ? Number.parseInt(traceId.slice(-8), 16) / 0x100000000 : Math.random();
    return draw < p;
  }
  try {
    return sampling.sampler(ctx) === true;
  } catch {
    return false;
  }
}

/**
 * The OpenTelemetry API's global registry (`@opentelemetry/api` 1.x keeps it on `globalThis` under this key; checked
 * against the installed 1.10.0, `src/internal/global-utils.ts`). Its `trace` entry exists only once something called
 * `trace.setGlobalTracerProvider()`: reading it tells whether the app registered a provider without loading the API.
 */
export const OTEL_API_KEY = Symbol.for("opentelemetry.js.api.1");

/** The registry's `trace` entry: the API's proxy provider, when the app registered one. */
export const registeredGlobalTrace = (): { getDelegate?: () => unknown } | undefined =>
  (globalThis as { [OTEL_API_KEY]?: { trace?: { getDelegate?: () => unknown } } })[OTEL_API_KEY]?.trace;

const allowing = new WeakMap<Redactor, Redactor>();
/**
 * `redactor`, with the `metadataMapping` targets allowed as keys: the app copied one of this library's ids there on
 * purpose (`session.id`, `langsmith.trace.session_id`), and a default sensitive key ("session") must not hide it.
 * Cached per redactor and mapping, so the hot path builds nothing.
 */
export function withMappedKeys(redactor: Redactor, mapping: Record<string, string>): Redactor {
  const targets = Object.values(mapping);
  if (!targets.length) return redactor;
  let out = allowing.get(redactor);
  if (!out) {
    out = redactor.extend({ allowKeys: targets });
    allowing.set(redactor, out);
  }
  return out;
}
