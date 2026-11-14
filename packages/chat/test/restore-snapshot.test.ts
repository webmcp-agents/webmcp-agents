import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppSnapshotStore,
  applyUrl,
  clearAppSnapshots,
  loadAppSnapshots,
  reapplyCheckpoint,
  saveAppSnapshots,
  snapshotsStorageKey,
} from "../src/session/restore-snapshot";

describe("restore-snapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores and forgets app payloads by message id", () => {
    const store = new AppSnapshotStore();
    store.set("u1", { cart: 1 });
    store.set("u2", undefined);
    expect(store.get("u1")).toEqual({ cart: 1 });
    expect(store.get("u2")).toBeUndefined();
    store.forget(["u1"]);
    expect(store.get("u1")).toBeUndefined();
  });

  it("persists and reloads app snapshots from sessionStorage", () => {
    const map = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    });
    const key = "web-agents:chat-test";
    const store = new AppSnapshotStore();
    store.set("u1", { lines: [{ slug: "mug" }] });
    saveAppSnapshots(key, store);
    expect(map.get(snapshotsStorageKey(key))).toContain("mug");

    const loaded = loadAppSnapshots(key);
    expect(loaded.get("u1")).toEqual({ lines: [{ slug: "mug" }] });

    clearAppSnapshots(key);
    expect(loadAppSnapshots(key).get("u1")).toBeUndefined();
  });

  it("applyUrl pushStates when the path differs", () => {
    const push = vi.fn();
    vi.stubGlobal("location", { pathname: "/", search: "", hash: "" });
    vi.stubGlobal("history", { state: null, pushState: push });
    const unique = `/wa-restore-${Date.now()}?q=1`;
    applyUrl(unique);
    expect(push).toHaveBeenCalledWith(null, "", unique);
    vi.stubGlobal("location", {
      pathname: unique.split("?")[0],
      search: `?${unique.split("?")[1]}`,
      hash: "",
    });
    applyUrl(unique);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("reapplyCheckpoint prefers applySnapshot and reports snapshotApplied", async () => {
    const apply = vi.fn();
    expect(await reapplyCheckpoint({ url: "/a", app: { n: 1 } }, apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith({ url: "/a", app: { n: 1 } });
    expect(await reapplyCheckpoint({})).toBe(false);
  });
});
