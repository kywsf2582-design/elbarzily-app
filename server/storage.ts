// Storage helpers. Supabase Storage is preferred for this staging deployment;
// the legacy Manus path remains as a fallback for older environments.

import { ENV } from "./_core/env";

type StorageRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
};

type SupabaseStorageConfig = { url: string; key: string; authorizationKey?: string; bucket: string };
let runtimeEnv: StorageRuntimeEnv = {};
let cachedSupabaseConfigKey = "";
let cachedSupabaseClient: SupabaseStorageClient | null = null;

export function setStorageRuntimeEnv(env: StorageRuntimeEnv) {
  runtimeEnv = env;
}

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set MANUS_API_URL and MANUS_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function cleanSupabaseKey(value?: string): string {
  return (value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^['"`]|['"`]$/g, "")
    .trim();
}

function supabaseConfig(): SupabaseStorageConfig | null {
  const url = (runtimeEnv.SUPABASE_URL || process.env.SUPABASE_URL)?.replace(/\/+$/, "") || "";
  // Keep opaque sb_secret_* keys in apikey; Storage also needs a JWT in Authorization.
  const secretKey = cleanSupabaseKey(runtimeEnv.SUPABASE_SECRET_KEY || process.env.SUPABASE_SECRET_KEY);
  const serviceRoleKey = cleanSupabaseKey(runtimeEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  const key = secretKey || serviceRoleKey;
  const authorizationKey = isLegacySupabaseJwt(key)
    ? key
    : isLegacySupabaseJwt(serviceRoleKey)
      ? serviceRoleKey
      : undefined;
  const bucket = runtimeEnv.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_STORAGE_BUCKET || "elbarzily-staging-uploads";
  return url && key ? { url, key, authorizationKey, bucket } : null;
}

function isLegacySupabaseJwt(key: string): boolean {
  if (key.startsWith("sb_secret_") || key.startsWith("sb_publishable_")) return false;
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some(part => !part || !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const headerPart = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const header = JSON.parse(atob(headerPart + "=".repeat((4 - headerPart.length % 4) % 4)));
    return header?.alg === "HS256" && (header?.typ === undefined || String(header.typ).toUpperCase() === "JWT");
  } catch {
    return false;
  }
}

function supabaseHeaders(config: SupabaseStorageConfig, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: config.key };
  // Never send an opaque sb_secret_* key as Bearer; use the legacy service-role JWT separately.
  if (config.authorizationKey) headers.Authorization = `Bearer ${config.authorizationKey}`;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

class SupabaseStorageClient {
  constructor(private readonly config: SupabaseStorageConfig) {}

  async upload(key: string, data: Buffer | Uint8Array | string, contentType: string) {
    const response = await fetch(`${this.config.url}/storage/v1/object/${encodeURIComponent(this.config.bucket)}/${objectPath(key)}`, {
      method: "POST",
      headers: { ...supabaseHeaders(this.config, contentType), "x-upsert": "false" },
      body: typeof data === "string" ? data : new Uint8Array(data as any),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Supabase Storage upload failed (${response.status}): ${message.slice(0, 240)}`);
    }
  }

  async signedUrl(key: string): Promise<string> {
    const response = await fetch(`${this.config.url}/storage/v1/object/sign/${encodeURIComponent(this.config.bucket)}/${objectPath(key)}`, {
      method: "POST",
      headers: supabaseHeaders(this.config, "application/json"),
      body: JSON.stringify({ expiresIn: 3600 }),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Supabase Storage signing failed (${response.status}): ${message.slice(0, 240)}`);
    }
    const result = await response.json() as { signedURL?: string; signedUrl?: string };
    const signed = result.signedURL || result.signedUrl;
    if (!signed) throw new Error("Supabase returned no signed URL");
    const normalizedSigned = signed.startsWith("/object/") ? `/storage/v1${signed}` : signed;
    return normalizedSigned.startsWith("http") ? normalizedSigned : `${this.config.url}${normalizedSigned}`;
  }

  async removeMany(keys: string[]) {
    const response = await fetch(`${this.config.url}/storage/v1/object/${encodeURIComponent(this.config.bucket)}`, {
      method: "DELETE",
      headers: supabaseHeaders(this.config, "application/json"),
      body: JSON.stringify({ prefixes: keys.map(normalizeKey) }),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Supabase Storage delete failed (${response.status}): ${message.slice(0, 240)}`);
    }
  }
}

function getSupabaseClient(): SupabaseStorageClient | null {
  const config = supabaseConfig();
  if (!config) return null;
  const cacheKey = `${config.url}\n${config.bucket}\n${config.key}\n${config.authorizationKey || ""}`;
  if (!cachedSupabaseClient || cacheKey !== cachedSupabaseConfigKey) {
    cachedSupabaseConfigKey = cacheKey;
    cachedSupabaseClient = new SupabaseStorageClient(config);
  }
  return cachedSupabaseClient;
}

function objectPath(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.upload(key, data, contentType);
    return { key, url: `/manus-storage/${key}` };
  }
  const { forgeUrl, forgeKey } = getForgeConfig();

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob = typeof data === "string"
    ? new Blob([data], { type: contentType })
    : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const supabase = getSupabaseClient();
  if (supabase) return supabase.signedUrl(key);

  const { forgeUrl, forgeKey } = getForgeConfig();
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  if (!url) throw new Error("Storage did not return a download URL");
  return url;
}

export async function storageDeleteMany(relKeys: string[]): Promise<void> {
  const keys = [...new Set(relKeys.map(normalizeKey).filter(Boolean))];
  if (!keys.length) return;
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase Storage is not configured for deleting uploaded files");
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await supabase.removeMany(keys.slice(offset, offset + 1000));
  }
}
