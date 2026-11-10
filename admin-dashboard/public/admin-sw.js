const CACHE = "elbarzily-admin-shell-v1";
const SHELL = ["/admin-dashboard/", "/admin-dashboard/admin-manifest.webmanifest", "/admin-dashboard/admin-icon-192.png", "/admin-dashboard/admin-icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/admin-dashboard/")) return;
  if (url.pathname.startsWith("/admin-dashboard/api/")) return;
  event.respondWith(fetch(request).catch(() => caches.match(request).then(cached => cached || caches.match("/admin-dashboard/"))));
});
