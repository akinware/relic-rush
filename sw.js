// Relic Rush service worker: the game works offline after the first visit.
const VERSION = 'relic-rush-__BUILD__';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || /\.(html|js|webmanifest)$/.test(new URL(req.url).pathname);
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (isPage) {   // pages + code: network first so updates show up, cache as fallback
      try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
      catch { return (await cache.match(req)) || (await cache.match('index.html')) || Response.error(); }
    }
    const hit = await cache.match(req);   // models, scripts, fonts: cache first (file names change when content does)
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
