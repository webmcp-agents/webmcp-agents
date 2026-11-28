/**
 * The optional peers, each loaded by a literal `import()` on first use (never at import time), so an app installs only
 * what its configuration needs and a bundler can see every specifier.
 */

/** The packages this entry may load. */
export type Peer =
  | "@opentelemetry/api"
  | "@ai-sdk/otel"
  | "@opentelemetry/sdk-trace"
  | "@opentelemetry/exporter-trace-otlp-proto"
  | "@opentelemetry/exporter-trace-otlp-grpc";

/**
 * How each peer is loaded. Mutable for this package's tests only (a missing package is simulated by replacing a
 * loader); nothing else may change it.
 *
 * @internal
 */
export const peerLoaders: Record<Peer, () => Promise<unknown>> = {
  "@opentelemetry/api": () => import("@opentelemetry/api"),
  "@ai-sdk/otel": () => import("@ai-sdk/otel"),
  "@opentelemetry/sdk-trace": () => import("@opentelemetry/sdk-trace"),
  "@opentelemetry/exporter-trace-otlp-proto": () => import("@opentelemetry/exporter-trace-otlp-proto"),
  "@opentelemetry/exporter-trace-otlp-grpc": () => import("@opentelemetry/exporter-trace-otlp-grpc"),
};

/** A peer that is not installed: the message names the package and the command that installs it. */
export class MissingPeerError extends Error {
  override name = "MissingPeerError";
  constructor(readonly peer: Peer) {
    super(`${peer} is not installed: add it to your dependencies (pnpm add ${peer}).`);
  }
}

const NOT_FOUND = /cannot find (module|package)|could not resolve|failed to (load|resolve)|is it installed|does the file exist/i;

/** True when `err` says `peer` itself could not be found (an error the package threw while loading is something else). */
export function isMissingModule(err: unknown, peer: string): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : String(err);
  if (!message.includes(peer)) return false;
  return e?.code === "ERR_MODULE_NOT_FOUND" || e?.code === "MODULE_NOT_FOUND" || NOT_FOUND.test(message);
}

/** Load `peer`; a missing one rejects with {@link MissingPeerError}, any other failure as it is. */
export async function loadPeer<T>(peer: Peer): Promise<T> {
  try {
    return (await peerLoaders[peer]()) as T;
  } catch (err) {
    if (isMissingModule(err, peer)) throw new MissingPeerError(peer);
    throw err;
  }
}
