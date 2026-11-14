/**
 * Per-turn page checkpoints for chat restore: the URL is already on `AgentMessage.page`;
 * optional app state (cart, selection, …) is captured with `getSnapshot` / reapplied with `applySnapshot`.
 * App payloads are JSON-serializable and can be persisted next to the conversation (`${storageKey}:snapshots`).
 */

/** What `session.restore` reapplies for the page (URL always; `app` only when the host captured it). */
export interface ChatRestoreSnapshot {
  /** Path + query + hash when the user message was sent (`AgentMessage.page`). */
  url?: string;
  /** Host-owned state from `getSnapshot` at that turn. */
  app?: unknown;
}

/** Options a host passes so restore can rehydrate more than tool `revert` + fills. */
export interface ChatRestoreSnapshots {
  /** Capture app state when the person sends a message (stored under that message id). */
  getSnapshot?: () => unknown;
  /**
   * Reapply a checkpoint before the thread truncates. Prefer the app's router (`navigate(url)`)
   * over raw `history` when the URL drives the UI. Called after fills/`revert` so this is the last word.
   */
  applySnapshot?: (snapshot: ChatRestoreSnapshot) => void | Promise<void>;
}

/** sessionStorage key for the app-snapshot map next to the conversation. */
export const snapshotsStorageKey = (storageKey: string): string => `${storageKey}:snapshots`;

/** In-memory `messageId → app` map for one session (URL lives on the message). */
export class AppSnapshotStore {
  private readonly apps = new Map<string, unknown>();

  /** Record whatever `getSnapshot` returned for this user message. */
  set(messageId: string, app: unknown): void {
    if (app === undefined) this.apps.delete(messageId);
    else this.apps.set(messageId, app);
  }

  /** App payload for `messageId`, if any. */
  get(messageId: string): unknown {
    return this.apps.get(messageId);
  }

  /** Drop entries for messages that left the conversation. */
  forget(messageIds: Iterable<string>): void {
    for (const id of messageIds) this.apps.delete(id);
  }

  /** Clear everything (New chat). */
  clear(): void {
    this.apps.clear();
  }

  /** Replace the map from a JSON object (sessionStorage hydrate). */
  replace(entries: Record<string, unknown>): void {
    this.apps.clear();
    for (const [id, app] of Object.entries(entries)) {
      if (app !== undefined) this.apps.set(id, app);
    }
  }

  /** Plain object for JSON persistence. */
  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [id, app] of this.apps) out[id] = app;
    return out;
  }
}

/** Load app snapshots from sessionStorage; empty on missing/invalid data. */
export function loadAppSnapshots(storageKey: string | false): AppSnapshotStore {
  const store = new AppSnapshotStore();
  if (!storageKey || typeof sessionStorage === "undefined") return store;
  try {
    const raw = sessionStorage.getItem(snapshotsStorageKey(storageKey));
    if (!raw) return store;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      store.replace(parsed as Record<string, unknown>);
    }
  } catch {
    // blocked or corrupt: start empty; URL on messages still restores
  }
  return store;
}

/** Persist the app-snapshot map (no-op when storage is off or blocked). */
export function saveAppSnapshots(storageKey: string | false, store: AppSnapshotStore): void {
  if (!storageKey || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(snapshotsStorageKey(storageKey), JSON.stringify(store.toJSON()));
  } catch {
    // storage blocked or full: in-memory checkpoints still work this visit
  }
}

/** Clear persisted app snapshots (New chat). */
export function clearAppSnapshots(storageKey: string | false): void {
  if (!storageKey || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(snapshotsStorageKey(storageKey));
  } catch {
    // ignore
  }
}

/**
 * Best-effort URL restore when the host did not pass `applySnapshot`: `history.pushState` + `popstate`.
 * SPA routers that ignore that should pass `applySnapshot` and call their own `navigate`.
 */
export function applyUrl(url: string): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const current = location.pathname + location.search + location.hash;
  if (current === url) return;
  history.pushState(history.state, "", url);
  if (typeof dispatchEvent === "function" && typeof PopStateEvent === "function") {
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }
}

/**
 * Reapply a checkpoint (custom hook or default URL). Returns whether a page checkpoint ran
 * (`applySnapshot` called, or a default URL change).
 */
export async function reapplyCheckpoint(
  snapshot: ChatRestoreSnapshot,
  applySnapshot?: ChatRestoreSnapshots["applySnapshot"],
): Promise<boolean> {
  if (applySnapshot) {
    await applySnapshot(snapshot);
    return true;
  }
  if (snapshot.url) {
    applyUrl(snapshot.url);
    return true;
  }
  return false;
}
