/// <reference types="@cloudflare/workers-types" />
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { sql } from "drizzle-orm";
import { sdk } from "../server/_core/sdk";
import { publicPlatformScript } from "../server/_core/publicConfig";
import { appRouter, readDownloadPageConfig } from "../server/routers";
import { getDb, withWorkerDatabase } from "../server/db";

type WorkerEnvironment = {
  HYPERDRIVE?: { connectionString: string };
  ALLOWED_ORIGINS?: string;
  APP_ID?: string;
  APP_PUBLIC_URL?: string;
  APP_SESSION_SECRET?: string;
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

async function handleTrpc(request: Request): Promise<Response> {
  const setCookies: string[] = [];
  const context = await createWorkerContext(request, setCookies);
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => context as never,
  });
  if (!setCookies.length) return response;

  const headers = new Headers(response.headers);
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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function dispatch(request: Request, env: WorkerEnvironment): Promise<Response> {
  const url = new URL(request.url);
  const downloadMatch = url.pathname.match(/^\/api\/download\/(android|windows)$/);
  if (downloadMatch && request.method === "GET") {
    const platform = downloadMatch[1];
    try {
      const config = await readDownloadPageConfig();
      let configuredUrl = platform === "android"
        ? (config?.mode ? config.url : "")
        : (config?.windowsUrl ?? "");
      const publicOrigin = env.APP_PUBLIC_URL || "https://elbarzily-neon-staging.pages.dev";
      if (platform === "android" && (!configuredUrl || configuredUrl.startsWith("/manus-storage/"))) {
        configuredUrl = new URL("/downloads/ElBarzily-Android-2.0.4.apk", publicOrigin).toString();
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
      await db.execute(sql`SELECT 1`);
      return Response.json({ status: "ok", database: "connected" }, {
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
    return handleTrpc(request);
  }
  return Response.json({ error: "not_found" }, { status: 404 });
}

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
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
      ? await withWorkerDatabase(connectionString, () => dispatch(request, env))
      : await dispatch(request, env);
    return withCors(response, origin);
  },
};
