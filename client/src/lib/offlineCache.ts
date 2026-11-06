import type { QueryClient, QueryKey } from "@tanstack/react-query";
import superjson from "superjson";

const STORAGE_KEY = "elbarzily:public-offline-cache:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_STORAGE_CHARS = 1_500_000;

type PublicCacheEntry = {
  queryKey: QueryKey;
  data: unknown;
  updatedAt: number;
};

type PublicCacheSnapshot = {
  savedAt: number;
  entries: PublicCacheEntry[];
};

function queryPath(key: QueryKey): string {
  const parts: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string") parts.push(value.toLowerCase());
    else if (Array.isArray(value)) value.forEach(collect);
  };
  collect(key[0]);
  return parts.join(".");
}

function isPublicOfflineQuery(key: QueryKey): boolean {
  const path = queryPath(key);
  return path === "pitches.list" || path === "subscriptions.plans";
}

function freshEnough(updatedAt: number, now = Date.now()): boolean {
  const age = now - updatedAt;
  return Number.isFinite(updatedAt) && age >= 0 && age <= MAX_AGE_MS;
}

export function restorePublicQueryCache(queryClient: QueryClient): void {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const snapshot = superjson.parse<PublicCacheSnapshot>(stored);
    if (!snapshot || !Array.isArray(snapshot.entries) || !freshEnough(snapshot.savedAt)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const now = Date.now();
    for (const entry of snapshot.entries) {
      if (
        entry &&
        Array.isArray(entry.queryKey) &&
        isPublicOfflineQuery(entry.queryKey) &&
        freshEnough(entry.updatedAt, now)
      ) {
        queryClient.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.updatedAt });
      }
    }
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage can be disabled */ }
  }
}

export function persistPublicQueryCache(queryClient: QueryClient): () => void {
  if (typeof window === "undefined") return () => undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = queryClient.getQueryCache().subscribe(event => {
    if (
      event.type !== "updated" ||
      event.query.state.status !== "success" ||
      !isPublicOfflineQuery(event.query.queryKey)
    ) return;

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const now = Date.now();
        const entries = queryClient.getQueryCache().getAll()
          .filter(query =>
            query.state.status === "success" &&
            isPublicOfflineQuery(query.queryKey) &&
            freshEnough(query.state.dataUpdatedAt, now)
          )
          .map(query => ({
            queryKey: query.queryKey,
            data: query.state.data,
            updatedAt: query.state.dataUpdatedAt,
          }));
        if (!entries.length) return;
        const serialized = superjson.stringify({ savedAt: now, entries } satisfies PublicCacheSnapshot);
        if (serialized.length <= MAX_STORAGE_CHARS) window.localStorage.setItem(STORAGE_KEY, serialized);
      } catch {
        // Keep the online application working if browser storage is full or unavailable.
      }
    }, 250);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
