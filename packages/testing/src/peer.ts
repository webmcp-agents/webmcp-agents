/**
 * Optional peers: an entry that needs one loads it here, so a missing package fails with one sentence that names it
 * instead of a bare "module not found".
 */

/** What `requirePeer` needs to word its error. */
export interface PeerOptions {
  /** The npm package to install, e.g. `"@webmcp-agents/chat"`. */
  peer: string;
  /** Who needs it, e.g. `"@webmcp-agents/testing/chat"` or `"mount(<JSX>)"`. */
  by: string;
}

/** The sentence a missing peer fails with. Exported for the kit's own tests. */
export const missingPeerMessage = ({ peer, by }: PeerOptions): string =>
  `${by} needs ${peer}, which is not installed: add it to your devDependencies (pnpm add -D ${peer}).`;

const NOT_FOUND = /cannot find (module|package)|could not resolve|failed to (load|resolve)|does the file exist|is it installed/i;

/**
 * True when `err` says `peer` could not be found (Node's ERR_MODULE_NOT_FOUND, Vite's "Could not resolve … Is it
 * installed?", Vitest's "Failed to load url"). An error the package threw while loading is not that, and is rethrown.
 */
export function isMissingModule(err: unknown, peer: string): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : String(err);
  if (!message.includes(peer)) return false;
  return e?.code === "ERR_MODULE_NOT_FOUND" || e?.code === "MODULE_NOT_FOUND" || NOT_FOUND.test(message);
}

/**
 * Load an optional peer. Resolves to the module; rejects with {@link missingPeerMessage} when the package is not
 * installed, and with the original error when it failed for another reason.
 *
 * @example
 * const chat = await requirePeer(() => import("@webmcp-agents/chat/agent"), { peer: "@webmcp-agents/chat", by: "@webmcp-agents/testing/chat" });
 */
export async function requirePeer<T>(load: () => Promise<T>, options: PeerOptions): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (isMissingModule(err, options.peer)) throw new Error(missingPeerMessage(options), { cause: err });
    throw err;
  }
}
