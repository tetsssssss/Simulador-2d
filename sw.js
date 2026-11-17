// Service worker: makes the game installable and playable offline.
//  * install: precache the app shell listed in sw-precache.js (code, styles, small data, icons) — best effort, one failed file never blocks the install;
//  * big assets (sprite atlases, .glb): cache-first, stored the first time they are used;
//  * everything else same-origin: network-first (updates show up when online) with the cache as the offline fallback;
//  * cross-origin requests (player photos, logos from external APIs) are left to the browser.
importScripts('sw-precache.js');
const { version, urls } = self.ASU_SW, SHELL = `asu-shell-${version}`, ASSETS = 'asu-assets-v1';
const isAsset = u => /\/assets\/(sprites|models)\//.test(u.pathname);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(urls.map(u => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('asu-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});
const networkFirst = async (req, timeoutMs = 4000) => {
  const c = await caches.open(SHELL);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch {
    return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('./index.html') : null) || Response.error();
  }
};
const cacheFirst = async req => {
  const c = await caches.open(ASSETS), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req); if (res && res.ok) c.put(req, res.clone()); return res;
};
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || req.headers.has('range')) return;
  const u = new URL(req.url); if (u.origin !== self.location.origin) return;
  e.respondWith(isAsset(u) ? cacheFirst(req) : networkFirst(req));
});
