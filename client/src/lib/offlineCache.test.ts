import { QueryClient, type QueryKey } from "@tanstack/react-query";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistPublicQueryCache, restorePublicQueryCache } from "./offlineCache";

const CACHE_KEY = "elbarzily:public-offline-cache:v1";

describe("public offline query cache", () => {
  let values: Map<string, string>;
  let originalWindow: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T14:00:00.000Z"));
    values = new Map();
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  });

  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    vi.useRealTimers();
  });

  it("persists only public pitches/plans and restores them for offline rendering", async () => {
    const pitchesKey: QueryKey = [["pitches", "list"], { type: "query" }];
    const plansKey: QueryKey = [["subscriptions", "plans"], { type: "query" }];
    const privateMessagesKey: QueryKey = [["chat", "messages"], { type: "query" }];
    const source = new QueryClient();
    const stop = persistPublicQueryCache(source);

    source.setQueryData(pitchesKey, { items: [{ id: 5, name: "ملعب محفوظ" }] });
    source.setQueryData(plansKey, { items: [{ id: 2, name: "باقة محفوظة" }] });
    source.setQueryData(privateMessagesKey, { items: [{ content: "لا تحفظ" }] });
    await vi.advanceTimersByTimeAsync(300);

    const stored = values.get(CACHE_KEY);
    expect(stored).toBeTruthy();
    const snapshot = superjson.parse<{ entries: Array<{ queryKey: QueryKey }> }>(stored!);
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries.some(entry => JSON.stringify(entry.queryKey).includes("chat"))).toBe(false);

    const restored = new QueryClient();
    restorePublicQueryCache(restored);
    expect(restored.getQueryData(pitchesKey)).toEqual({ items: [{ id: 5, name: "ملعب محفوظ" }] });
    expect(restored.getQueryData(plansKey)).toEqual({ items: [{ id: 2, name: "باقة محفوظة" }] });
    expect(restored.getQueryData(privateMessagesKey)).toBeUndefined();
    stop();
    source.clear();
    restored.clear();
  });
});
