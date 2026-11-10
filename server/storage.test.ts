import { afterEach, describe, expect, it, vi } from "vitest";
import { setStorageRuntimeEnv, storageGetSignedUrl, storagePut } from "./storage";

function makeLegacyServiceRoleJwt() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

function stubSuccessfulUpload() {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => {
  setStorageRuntimeEnv({});
  vi.unstubAllGlobals();
});

describe("Supabase Storage authorization headers", () => {
  it("keeps an opaque secret in apikey and sends the legacy service-role JWT separately", async () => {
    const serviceRoleJwt = makeLegacyServiceRoleJwt();
    const calls = stubSuccessfulUpload();
    setStorageRuntimeEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_STORAGE_BUCKET: "private-uploads",
      SUPABASE_SECRET_KEY: "sb_secret_test_only",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
    });

    await storagePut("uploads/7/profile.png", Uint8Array.from([1, 2, 3]), "image/png");

    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("apikey")).toBe("sb_secret_test_only");
    expect(headers.get("authorization")).toBe(`Bearer ${serviceRoleJwt}`);
    expect(headers.get("authorization")).not.toContain("sb_secret_test_only");
  });

  it("preserves legacy service-role JWT installations", async () => {
    const serviceRoleJwt = makeLegacyServiceRoleJwt();
    const calls = stubSuccessfulUpload();
    setStorageRuntimeEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_STORAGE_BUCKET: "private-uploads",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
    });

    await storagePut("uploads/7/profile.png", Uint8Array.from([1, 2, 3]), "image/png");

    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("apikey")).toBe(serviceRoleJwt);
    expect(headers.get("authorization")).toBe(`Bearer ${serviceRoleJwt}`);
  });

  it("requests a signed read URL with the storage bucket and proper authorization", async () => {
    const serviceRoleJwt = makeLegacyServiceRoleJwt();
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ signedURL: "/storage/v1/object/sign/private-uploads/uploads/7/profile.png?token=test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    setStorageRuntimeEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_STORAGE_BUCKET: "private-uploads",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleJwt,
    });

    const signedUrl = await storageGetSignedUrl("uploads/7/profile.png");

    expect(signedUrl).toBe("https://project.supabase.co/storage/v1/object/sign/private-uploads/uploads/7/profile.png?token=test");
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe("https://project.supabase.co/storage/v1/object/sign/private-uploads/uploads/7/profile.png");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ expiresIn: 3600 });
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("apikey")).toBe(serviceRoleJwt);
    expect(headers.get("authorization")).toBe(`Bearer ${serviceRoleJwt}`);
  });
});
