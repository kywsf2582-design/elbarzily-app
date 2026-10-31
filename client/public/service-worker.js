const CACHE = "elbarzily-shell-v4-push";
const SHELL = ["/", "/manifest.webmanifest", "/app-icon.png", "/app-icon-192.png", "/app-icon-512.png", "/brzly-logo.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put("/", response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/"))));
    return;
  }
  if (url.pathname.startsWith("/assets/") || /\.(?:png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    })));
  }
});
