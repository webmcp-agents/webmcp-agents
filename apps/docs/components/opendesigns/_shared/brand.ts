"use client";
import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    __opendesignsBrand?: string;
  }
}

export const DEFAULT_BRAND = "WebMCP Agents";

const BRAND_EVENT = "opendesigns:brand";
const THEME_STORAGE_KEY = "opendesigns-theme-config";

const currentName = (): string =>
  (typeof window === "undefined" ? undefined : window.__opendesignsBrand) ||
  DEFAULT_BRAND;

const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "") || "app";

/**
 * Live brand: the hub's theme store sets `window.__opendesignsBrand` and
 * dispatches `opendesigns:brand`; elsewhere this is the default. Both fields
 * are getters, so they read the current value each time they are used.
 */
export const brand = {
  get name(): string {
    return currentName();
  },
  get slug(): string {
    return toSlug(currentName());
  },
};

const storedName = (): string | undefined => {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    const name = (parsed as { brand?: { name?: unknown } } | undefined)?.brand
      ?.name;
    return typeof name === "string" && name ? name : undefined;
  } catch {
    return undefined;
  }
};

const subscribe = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      onChange();
    }
  };
  window.addEventListener(BRAND_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(BRAND_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
};

const getSnapshot = (): string =>
  window.__opendesignsBrand || storedName() || DEFAULT_BRAND;

const getServerSnapshot = (): string => DEFAULT_BRAND;

export const useBrandName = (): string =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
