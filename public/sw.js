// Minimal service worker: makes the app installable and shows a simple page when offline.
const CACHE = "ilm-v1";
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icon-192.png"]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response("<meta name=viewport content='width=device-width'><body style='font-family:sans-serif;padding:24px'><h2>No internet</h2><p>Connect and try again.</p></body>", { headers: { "Content-Type": "text/html" } })));
});
