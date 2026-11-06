const CACHE = "elbarzily-shell-v5-offline";
const SHELL = [
  "/",
  "/admin-dashboard/",
  "/manifest.webmanifest",
  "/app-icon.png",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/brzly-logo.svg",
  ...Array.from({ length: 20 }, (_, index) => `/pitch-images/pitch-${String(index + 1).padStart(2, "0")}.webp`),
  ...Array.from({ length: 4 }, (_, index) => `/package-images/plan-${String(index + 1).padStart(2, "0")}.webp`),
];

async function cacheSuccessfulResponse(cache, request, response) {
  if (response && response.ok) await cache.put(request, response.clone());
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async path => {
      try {
        const response = await fetch(path, { cache: "reload" });
        await cacheSuccessfulResponse(cache, path, response);
      } catch {
        // A missing optional asset must not prevent the service worker from installing.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "لديك تحديث جديد من البرازيلي." }; }
  const title = payload.title || "البرازيلي";
  const options = {
    body: payload.body || "لديك تحديث جديد.",
    icon: payload.icon || payload.senderAvatarUrl || "/app-icon-192.png",
    badge: payload.badge || "/app-icon-192.png",
    dir: "rtl",
    lang: "ar",
    tag: payload.tag || `elbarzily-${payload.category || "general"}`,
    renotify: true,
    requireInteraction: payload.category === "calls",
    data: { url: payload.url || "/", category: payload.category || "general", senderName: payload.senderName || null },
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : payload.category === "calls" ? [{ action: "open", title: "فتح المكالمة" }, { action: "decline", title: "رفض" }] : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetPath = event.action === "decline" ? `${data.url || "/chat"}${String(data.url || "").includes("?") ? "&" : "?"}callAction=decline` : data.url || "/";
  const target = new URL(targetPath, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => "focus" in client);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/manus-storage/") || url.pathname.startsWith("/__") || url.pathname.startsWith("/manus-oauth/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cacheSuccessfulResponse(cache, request, response);
          if (url.pathname === "/") await cacheSuccessfulResponse(cache, "/", response);
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match(url.pathname.startsWith("/admin-dashboard") ? "/admin-dashboard/" : "/")) || new Response(
          "<!doctype html><html lang=\"ar\" dir=\"rtl\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>البرازيلي - دون اتصال</title><body style=\"font-family:system-ui;display:grid;place-items:center;min-height:90vh;background:#080d0a;color:#f4f7f4;text-align:center\"><main><h1>لا يوجد اتصال بالإنترنت</h1><p>أعد الاتصال لفتح التطبيق أو تحديث البيانات.</p></main></body></html>",
          { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
    })());
    return;
  }

  const cacheable = ["script", "style", "image", "font", "worker"].includes(request.destination) ||
    url.pathname.startsWith("/pitch-images/") ||
    url.pathname.startsWith("/package-images/") ||
    url.pathname === "/manifest.webmanifest";
  if (!cacheable) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cacheSuccessfulResponse(cache, request, response);
    }
    return response;
  })());
});
