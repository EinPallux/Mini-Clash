/**
 * Offline cache (ROADMAP v0.2 acceptance: airplane-mode playthrough after first
 * cache). The build injects the full precache list below (app shell, hashed
 * bundles, game assets, icons, fonts) — install caches everything up front, so
 * offline never depends on which requests raced past the first-visit install.
 */
const PRECACHE = self.__PRECACHE_MANIFEST__ || ['/'];
const CACHE = `mini-clash-${self.__PRECACHE_VERSION__ || 'dev'}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never the platform api (v0.7). It is dynamic, personal and cookie-scoped:
  // a cache hit would show a stale coin balance that never corrects itself, and
  // on a shared browser it could hand one account's profile to the next player.
  // Straight to the network, and nothing kept.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  // Navigations: network-first so deploys land, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Everything else same-origin: cache-first (all build output is precached).
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
