import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Readable, pipeline as pipelineCallback } from "node:stream";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter, readDownloadPageConfig } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { getDb } from "../db";
import { platformSettings } from "../../drizzle/schema.pg";
import { processDueBookingReminders } from "../email/reminders";
import { storageGetSignedUrl } from "../storage";

const pipeline = promisify(pipelineCallback);

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const configuredOrigin = process.env.ADMIN_DASHBOARD_ORIGIN?.trim();
    const isAllowed = Boolean(origin && (origin === configuredOrigin || origin === "http://localhost:3200" || origin === "http://127.0.0.1:3200"));
    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(isAllowed ? 204 : 403);
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/download/:platform", async (req, res) => {
    const platform = req.params.platform === "android" || req.params.platform === "windows" ? req.params.platform : null;
    if (!platform) return res.status(404).send("Download not found");

    try {
      const config = await readDownloadPageConfig();
      const configuredUrl = platform === "android"
        ? (config?.mode ? config.url : "")
        : (config?.windowsUrl ?? "");
      if (!configuredUrl) return res.status(404).json({ error: "download_not_configured", message: "ملف التنزيل غير مفعّل حالياً." });

      // Let the platform's storage gateway stream large installers directly. Proxying a
      // 100MB+ EXE through the app process can exceed the runtime response limit.
      if (platform === "windows" && !configuredUrl.startsWith("/manus-storage/")) {
        // Use only the saved Windows URL; redirect large CDN installers instead of proxying them.
        let windowsTarget: URL;
        try { windowsTarget = new URL(configuredUrl); } catch { return res.status(503).json({ error: "download_source_invalid", message: "رابط نسخة Windows المحفوظ غير صالح." }); }
        if (windowsTarget.protocol !== "https:" || windowsTarget.username || windowsTarget.password)
          return res.status(503).json({ error: "download_source_invalid", message: "رابط نسخة Windows المحفوظ يجب أن يكون HTTPS." });
        res.set("Cache-Control", "no-store");
        return res.redirect(307, windowsTarget.toString());
      }

      if (configuredUrl.startsWith("/manus-storage/")) {
        const configuredName = platform === "android" ? config?.fileName : config?.windowsFileName;
        const fallbackName = platform === "android" ? "ElBarzily.apk" : "El-Barzily-Setup.exe";
        const fileName = (configuredName || fallbackName)
          .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
          .trim() || fallbackName;
        const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || fallbackName;
        res.set("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.set("Cache-Control", "no-store");
        return res.redirect(307, configuredUrl);
      }

      const targetUrl = configuredUrl.startsWith("/manus-storage/")
        ? await storageGetSignedUrl(configuredUrl.slice("/manus-storage/".length))
        : configuredUrl.startsWith("/")
          ? `${req.protocol}://${req.get("host")}${configuredUrl}`
          : configuredUrl;
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "https:" && !configuredUrl.startsWith("/"))
        return res.status(400).send("Download URL must use HTTPS");

      const upstream = await fetch(parsed, { redirect: "follow", signal: AbortSignal.timeout(8 * 60 * 1000) });
      if (!upstream.ok || !upstream.body) return res.status(502).json({ error: "download_source_unavailable", message: `مصدر ملف ${platform === "windows" ? "Windows" : "Android"} غير متاح حالياً.` });

      const configuredName = platform === "android" ? config?.fileName : config?.windowsFileName;
      const fallbackName = platform === "android" ? "ElBarzily.apk" : "El-Barzily-Setup.exe";
      const fileName = (configuredName || fallbackName)
        .replace(/[\u0000-\u001f\u007f"\\/]/g, "_")
        .trim() || fallbackName;
      const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || fallbackName;
      res.set("Content-Type", upstream.headers.get("content-type") || (platform === "android" ? "application/vnd.android.package-archive" : "application/octet-stream"));
      res.set("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.set("Cache-Control", "no-store");
      const length = upstream.headers.get("content-length");
      if (length) res.set("Content-Length", length);
      await pipeline(Readable.fromWeb(upstream.body as any), res);
    } catch (error) {
      console.error(`[DownloadProxy] ${platform} download failed:`, error);
      if (!res.headersSent) res.status(502).json({ error: "download_proxy_error", message: "تعذر تجهيز ملف التنزيل حالياً. حاول مرة أخرى بعد قليل." });
      else if (!res.writableEnded) res.destroy(error instanceof Error ? error : undefined);
    }
  });
  app.post("/api/scheduled/booking-reminders", async (req, res) => {
    const ticket = req.headers.cookie
      ?.split(";")
      .map(part => part.trim())
      .find(part => part.startsWith("app_session_id="))
      ?.slice("app_session_id=".length);
    const signedIdentity = await sdk.verifySession(ticket);
    if (!signedIdentity?.openId.startsWith("cron_"))
      return res.status(401).json({ error: "unauthorized" });

    let identity;
    try {
      identity = await sdk.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!identity.isCron || !identity.taskUid)
      return res.status(403).json({ error: "cron_identity_required" });

    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database_unavailable" });
    const configuredTask = await db.select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, "booking_reminder_task_uid"))
      .limit(1);
    if (configuredTask[0]?.value !== identity.taskUid)
      return res.status(403).json({ error: "task_not_configured" });

    try {
      const result = await processDueBookingReminders();
      return res.status(200).json({ ok: true, ...result });
    } catch {
      console.error("[Reminder] Scheduled email run failed");
      return res.status(500).json({ error: "reminder_run_failed" });
    }
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // The admin dashboard is a separate frontend bundle that shares this API and database.
  // It is mounted under its own entry path so it never becomes part of the player SPA.
  app.use("/admin-dashboard", express.static(path.resolve(process.cwd(), "admin-dashboard/dist"), { index: "index.html" }));
  app.get(["/admin", "/admin/", "/open/admin"], (_req, res) => res.redirect(308, "/admin-dashboard/"));
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
