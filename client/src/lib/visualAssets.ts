export const pitchImageAssets = Array.from(
  { length: 20 },
  (_, index) => `/pitch-images/pitch-${String(index + 1).padStart(2, "0")}.webp`,
);

export const planImageAssets = Array.from(
  { length: 4 },
  (_, index) => `/package-images/plan-${String(index + 1).padStart(2, "0")}.webp`,
);

type ImageRecord = {
  id: number | string;
  imageUrl?: string | null;
  posterUrl?: string | null;
};

function normalizedImageKey(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0];
  try {
    const url = new URL(withoutQuery, "https://assets.elbarzily.invalid");
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return withoutQuery.trim().toLowerCase();
  }
}

function usableImageUrl(value?: string | null): value is string {
  const candidate = value?.trim();
  if (!candidate) return false;
  try {
    const url = new URL(candidate, "https://assets.elbarzily.invalid");
    return ["http:", "https:"].includes(url.protocol) && !url.pathname.startsWith("/manus-storage/");
  } catch {
    return false;
  }
}

function assignUniqueImages<T extends ImageRecord>(records: readonly T[], pool: readonly string[]): Map<number, string> {
  const result = new Map<number, string>();
  const used = new Set<string>();
  let nextAsset = 0;
  const ordered = [...records].sort((left, right) => Number(left.id) - Number(right.id));

  for (const record of ordered) {
    const custom = record.posterUrl || record.imageUrl;
    const customKey = custom && usableImageUrl(custom) ? normalizedImageKey(custom) : "";
    if (custom && customKey && !used.has(customKey)) {
      result.set(Number(record.id), custom.trim());
      used.add(customKey);
      continue;
    }

    while (nextAsset < pool.length && used.has(normalizedImageKey(pool[nextAsset]))) nextAsset += 1;
    const fallback = pool[nextAsset];
    if (fallback) {
      result.set(Number(record.id), fallback);
      used.add(normalizedImageKey(fallback));
      nextAsset += 1;
    } else {
      // Do not recycle a photo when the catalog exceeds its 20/4 curated assets.
      result.set(Number(record.id), "");
    }
  }

  return result;
}

export function assignUniquePitchImages<T extends ImageRecord>(pitches: readonly T[]): Map<number, string> {
  return assignUniqueImages(pitches, pitchImageAssets);
}

export function assignUniquePlanImages<T extends ImageRecord>(plans: readonly T[]): Map<number, string> {
  return assignUniqueImages(plans, planImageAssets);
}

export function defaultPitchImageForId(id: number | string): string {
  const index = Math.max(0, Math.floor(Number(id) || 1) - 1) % pitchImageAssets.length;
  return pitchImageAssets[index];
}
