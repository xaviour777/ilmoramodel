// Service worker: makes the app installable, keeps the driver's trip board working without
// internet (the page and its scripts are kept on the phone), and shows phone alerts.
const CACHE = "ilm-v2";
const OFFLINE_PAGES = ["/driver"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icon-192.png"]))); self.skipWaiting(); });
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));

const offlineHtml = () => new Response("<meta name=viewport content='width=device-width'><body style='font-family:sans-serif;padding:24px'><h2>No internet</h2><p>Connect and try again.</p></body>", { headers: { "Content-Type": "text/html" } });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // the app's scripts and styles never change under the same name: keep a copy
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (req.mode !== "navigate") return;
  // the trip board: fresh when online, the last copy when offline
  if (OFFLINE_PAGES.includes(url.pathname)) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
      return res;
    }).catch(() => caches.match(url.pathname).then((hit) => hit || offlineHtml())));
    return;
  }
  e.respondWith(fetch(req).catch(offlineHtml));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "School", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "School", { body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(e.notification.data && e.notification.data.url ? e.notification.data.url : "/"));
});
