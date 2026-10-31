import type { Persister, PersistedClient } from "@tanstack/query-persist-client-core";

const DB_NAME = "elbarzily-local-cache";
const STORE_NAME = "query-cache";
const CACHE_KEY = "tanstack-query";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
    request.onsuccess = () => { db.close(); resolve(request.result as T); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export const idbPersister: Persister = {
  persistClient: async (client: PersistedClient) => { await withStore("readwrite", store => store.put(client, CACHE_KEY)); },
  restoreClient: async () => (await withStore<PersistedClient>("readonly", store => store.get(CACHE_KEY))) ?? undefined,
  removeClient: async () => { await withStore("readwrite", store => store.delete(CACHE_KEY)); },
};
