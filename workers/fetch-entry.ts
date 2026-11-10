/// <reference types="@cloudflare/workers-types" />
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { and, eq, isNull, sql } from "drizzle-orm";
import { sdk } from "../server/_core/sdk";
import { publicPlatformScript } from "../server/_core/publicConfig";
import { setStorageRuntimeEnv, storageGetSignedUrl } from "../server/storage";
import { appRouter, readDownloadPageConfig } from "../server/routers";
import { getDb, withWorkerDatabase } from "../server/db";
import { realtimeInvalidationForProcedures, successfulTrpcResponse } from "../server/realtime";
import { verifyRealtimeTicket } from "../server/realtime-token";
import { setWorkersAiBinding } from "../server/_core/llm";
import { bookings, chatMembers, chatMessages, chatRooms, ownerPlans, pitches, rewards, subscriptionRequests, uploadedAssets, users } from "../drizzle/schema.pg";
export { ElBarzilyRealtimeHub } from "./realtime-hub";

type WorkerEnvironment = {
  AI?: Ai;
  HYPERDRIVE?: { connectionString: string };
  ALLOWED_ORIGINS?: string;
  APP_ID?: string;
  APP_PUBLIC_URL?: string;
  APP_SESSION_SECRET?: string;
  WINDOWS_DOWNLOAD_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
  REALTIME_HUB?: DurableObjectNamespace;
};

type CookieOptions = {
  maxAge?: number;
  expires?: Date;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | string;
};

function serializeExpressCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite === true) parts.push("SameSite=Strict");
  else if (typeof options.sameSite === "string") {
    parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
  }
  return parts.join("; ");
}

async function createWorkerContext(request: Request, setCookies: string[]) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(
    Array.from(request.headers.entries()).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const req = {
    headers,
    path: url.pathname,
    method: request.method,
    protocol: url.protocol.replace(":", ""),
    query: Object.fromEntries(url.searchParams.entries()),
    get(name: string) { return headers[name.toLowerCase()]; },
  };
  const res = {
    cookie(name: string, value: string, options?: CookieOptions) {
      setCookies.push(serializeExpressCookie(name, value, options));
      return this;
    },
    clearCookie(name: string, options?: CookieOptions) {
      setCookies.push(serializeExpressCookie(name, "", {
        ...options,
        maxAge: 0,
        expires: new Date(0),
      }));
      return this;
    },
  };

  let user = null;
  try {
    user = await sdk.authenticateRequest(req as never);
  } catch {
    user = null;
  }
  return { req, res, user };
}

async function publishRealtime(env: WorkerEnvironment, event: { type: "invalidate"; roots: string[]; adminAreas: string[] }): Promise<void> {
  const secret = env.APP_SESSION_SECRET ?? process.env.APP_SESSION_SECRET;
  if (!env.REALTIME_HUB || !secret) throw new Error("Realtime binding or internal secret is unavailable");
  const hubId = env.REALTIME_HUB.idFromName("elbarzily-staging-global");
  const hub = env.REALTIME_HUB.get(hubId);
  const response = await hub.fetch(new Request("https://realtime.internal/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-realtime-internal": secret },
    body: JSON.stringify(event),
  }));
  if (!response.ok) throw new Error(`Realtime publish failed with ${response.status}`);
}

async function handleTrpc(request: Request, env: WorkerEnvironment, executionContext: ExecutionContext): Promise<Response> {
  const setCookies: string[] = [];
  const context = await createWorkerContext(request, setCookies);
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => context as never,
  });
  if (request.method === "POST" && context.user) {
    const url = new URL(request.url);
    const procedures = url.pathname.replace(/^\/api\/trpc\/?/, "").split(",").map(path => {
      try { return decodeURIComponent(path); } catch { return path; }
    });
    const event = realtimeInvalidationForProcedures(procedures);
    if (event) {
      try {
        const payload = await response.clone().json();
        if (successfulTrpcResponse(payload)) {
          executionContext.waitUntil(publishRealtime(env, event).catch(error => {
            console.warn("[Realtime] invalidation delivery failed", error instanceof Error ? error.message : "unknown");
          }));
        }
      } catch {
        // A non-JSON or failed tRPC response must never emit an invalidation.
      }
    }
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  for (const value of setCookies) headers.append("Set-Cookie", value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, trpc-accept");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Vary", "Origin");
  if (response.status === 101 && response.webSocket) {
    return new Response(null, {
      status: 101,
      statusText: response.statusText,
      headers,
      webSocket: response.webSocket,
    });
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type StorageAuthUser = { id: number; role: string; moderatorPermissions?: string[] };
function hasStorageScope(user: StorageAuthUser, scope: string) {
  return user.role === "admin" || user.role === "super_admin" ||
    (user.role === "moderator" && Array.isArray(user.moderatorPermissions) && user.moderatorPermissions.includes(scope));
}

async function authorizeStorageKey(request: Request, key: string): Promise<true | Response> {
  const db = await getDb();
  if (!db) return Response.json({ error: "database_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const storagePath = `/manus-storage/${key}`;
  const publicProfileImage = (await db.select({ id: users.id }).from(users).where(eq(users.avatarUrl, storagePath)).limit(1))[0];
  if (publicProfileImage) return true;
  const publicPlanImage = (await db.select({ id: ownerPlans.id }).from(ownerPlans).where(eq(ownerPlans.imageUrl, storagePath)).limit(1))[0];
  if (publicPlanImage) return true;
  // Reward artwork is public product imagery; files not referenced by a reward remain private.
  const publicRewardImage = (await db.select({ id: rewards.id }).from(rewards)
    .where(eq(rewards.imageUrl, storagePath)).limit(1))[0];
  if (publicRewardImage) return true;
  const asset = (await db.select({ ownerId: uploadedAssets.ownerId }).from(uploadedAssets).where(eq(uploadedAssets.key, key)).limit(1))[0];
  if (!asset) return Response.json({ error: "storage_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const cookies: string[] = [];
  const context = await createWorkerContext(request, cookies);
  const user = context.user as unknown as StorageAuthUser | null;
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (asset.ownerId === user.id || user.role === "admin" || user.role === "super_admin") return true;

  const supportMedia = (await db.select({ roomId: chatRooms.id })
    .from(chatMessages)
    .innerJoin(chatRooms, eq(chatRooms.id, chatMessages.roomId))
    .where(and(eq(chatMessages.mediaUrl, storagePath), eq(chatRooms.roomType, "support"), isNull(chatMessages.deletedAt)))
    .limit(1))[0];
  if (supportMedia) {
    if (hasStorageScope(user, "support")) return true;
    const membership = (await db.select({ id: chatMembers.id }).from(chatMembers)
      .where(and(eq(chatMembers.roomId, supportMedia.roomId), eq(chatMembers.userId, user.id))).limit(1))[0];
    if (membership) return true;
  }

  const bookingReceipt = (await db.select({ ownerId: pitches.ownerId, playerId: bookings.playerId })
    .from(bookings).innerJoin(pitches, eq(pitches.id, bookings.pitchId))
    .where(eq(bookings.receiptUrl, storagePath)).limit(1))[0];
  if (bookingReceipt && (bookingReceipt.playerId === user.id || bookingReceipt.ownerId === user.id || hasStorageScope(user, "receipts"))) return true;

  const subscriptionReceipt = (await db.select({ ownerId: subscriptionRequests.ownerId })
    .from(subscriptionRequests).where(eq(subscriptionRequests.receiptUrl, storagePath)).limit(1))[0];
  if (subscriptionReceipt && (subscriptionReceipt.ownerId === user.id || hasStorageScope(user, "receipts"))) return true;

  return Response.json({ error: "storage_forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

async function dispatch(request: Request, env: WorkerEnvironment, executionContext: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api/realtime") {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426, headers: { "Cache-Control": "no-store" } });
    }
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map(value => value.trim());
    if (!protocols.includes("elbarzily-realtime-v1")) {
      return Response.json({ error: "realtime_protocol_required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const context = await createWorkerContext(request, []);
    let user = context.user as { id?: number; role?: string; isSuspended?: boolean } | null;
    const secret = env.APP_SESSION_SECRET ?? process.env.APP_SESSION_SECRET;
    if (!user) {
      const ticketProtocol = protocols.find(value => value.startsWith("auth."));
      const ticket = ticketProtocol?.slice("auth.".length) ?? "";
      const appId = env.APP_ID ?? process.env.APP_ID ?? "";
      const claims = await verifyRealtimeTicket(ticket, secret ?? "", appId);
      if (claims) {
        const db = await getDb();
        if (!db) return Response.json({ error: "database_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
        user = (await db.select({ id: users.id, role: users.role, isSuspended: users.isSuspended })
          .from(users).where(eq(users.id, claims.userId)).limit(1))[0] ?? null;
      }
    }
    if (!user || !Number.isInteger(user.id) || !user.role || user.isSuspended) {
      return Response.json({ error: "authentication_required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    if (!env.REALTIME_HUB || !secret) {
      return Response.json({ error: "realtime_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const headers = new Headers({
      Upgrade: "websocket",
      "x-realtime-internal": secret,
      "x-realtime-user-id": String(user.id),
      "x-realtime-role": user.role,
      "Sec-WebSocket-Protocol": "elbarzily-realtime-v1",
    });
    return env.REALTIME_HUB.get(env.REALTIME_HUB.idFromName("elbarzily-staging-global"))
      .fetch(new Request("https://realtime.internal/connect", { method: "GET", headers }));
  }
  if (request.method === "GET" && url.pathname.startsWith("/manus-storage/")) {
    const key = decodeURIComponent(url.pathname.slice("/manus-storage/".length));
    if (!key || key.includes("..")) return Response.json({ error: "invalid_storage_key" }, { status: 400 });
    const access = await authorizeStorageKey(request, key);
    if (access !== true) return access;
    try {
      const target = await storageGetSignedUrl(key);
      return new Response(null, { status: 307, headers: { Location: target, "Cache-Control": "private, no-store" } });
    } catch (error) {
      console.error("[StorageProxy] signed URL failed", error instanceof Error ? error.message : "unknown");
      return Response.json({ error: "storage_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  const downloadMatch = url.pathname.match(/^\/api\/download\/(android|windows)$/);
  if (downloadMatch && request.method === "GET") {
    const platform = downloadMatch[1];
    try {
      const config = await readDownloadPageConfig();
      let configuredUrl = platform === "android"
        ? (config?.mode ? config.url : "")
        : (config?.windowsUrl ?? "");
      const publicOrigin = env.APP_PUBLIC_URL || "https://elbarzily-neon-staging.pages.dev";
      if (platform === "windows" && env.WINDOWS_DOWNLOAD_URL?.trim()) {
        configuredUrl = env.WINDOWS_DOWNLOAD_URL.trim();
      } else if (!configuredUrl || configuredUrl.startsWith("/manus-storage/")) {
        const fallbackFile = platform === "android"
          ? "ElBarzily-Android-2.0.4.apk"
          : (config?.windowsFileName || "ElBarzily-1.0.9.exe");
        configuredUrl = new URL(`/downloads/${encodeURIComponent(fallbackFile)}`, publicOrigin).toString();
      }
      if (!configuredUrl) {
        return Response.json({ error: "download_not_configured" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }
      if (configuredUrl.startsWith("/downloads/")) {
        configuredUrl = new URL(configuredUrl, publicOrigin).toString();
      } else if (configuredUrl.startsWith("/manus-storage/")) {
        return Response.json({ error: "windows_storage_migration_required" }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      const target = new URL(configuredUrl);
      if (target.protocol !== "https:" || target.username || target.password) {
        return Response.json({ error: "download_source_invalid" }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      if (platform === "windows" && env.WINDOWS_DOWNLOAD_URL?.trim()) {
        const upstream = await fetch(target, { headers: request.headers });
        const headers = new Headers(upstream.headers);
        const filename = "ElBarzily-Windows-1.1.0.exe";
        headers.set("Content-Disposition", `attachment; filename="${filename}"`);
        headers.set("Cache-Control", "no-store");
        return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
      }
      return new Response(null, {
        status: 307,
        headers: { Location: target.toString(), "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ error: "download_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  if (url.pathname === "/api/health" && request.method === "GET") {
    return Response.json({ status: "ok", runtime: "cloudflare-workers" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (url.pathname === "/api/health/db" && request.method === "GET") {
    try {
      const db = await getDb();
      if (!db) throw new Error("database unavailable");
      const result = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'chat_call_signals') AS "callSignalsTable"`);
      const queryResult = result as unknown as { rows?: Array<{ callSignalsTable?: boolean }> };
      return Response.json({ status: "ok", database: "connected", callSignalsTable: Boolean(queryResult.rows?.[0]?.callSignalsTable) }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json({ status: "error", database: "unavailable" }, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }
  if (url.pathname === "/api/platform/config.js" && request.method === "GET") {
    return new Response(publicPlatformScript(), {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  if (url.pathname.startsWith("/api/oauth/")) {
    return Response.json({ error: "oauth_disabled", message: "OAuth is not configured for this staging Worker." }, { status: 410 });
  }
  if (url.pathname === "/api/trpc" || url.pathname.startsWith("/api/trpc/")) {
    return handleTrpc(request, env, executionContext);
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: WorkerEnvironment, executionContext: ExecutionContext): Promise<Response> {
    setStorageRuntimeEnv(env);
    setWorkersAiBinding(env.AI);
    const origin = request.headers.get("origin");
    const allowList = new Set(
      (env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map(value => value.trim())
        .filter(Boolean),
    );
    if (origin && !allowList.has(origin)) {
      return Response.json({ error: "origin_not_allowed" }, { status: 403 });
    }
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin);
    }

    const connectionString = env.HYPERDRIVE?.connectionString;
    const response = connectionString
      ? await withWorkerDatabase(connectionString, () => dispatch(request, env, executionContext))
      : await dispatch(request, env, executionContext);
    return withCors(response, origin);
  },
};
