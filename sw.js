const CACHE = 'quete-cap-homard-v9';
const FICHIERS = ['./', 'index.html', 'style.css?v=9', 'app.js?v=9', 'etapes.js?v=9', 'img/rocher.jpg', 'img/carte.jpg', 'img/logo-pullup.png', 'manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('version.json')) return; // toujours le réseau, jamais le cache
  e.respondWith(
    fetch(e.request).then((r) => {
      const copie = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copie)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: false }).then((r) => r || caches.match('index.html')))
  );
});
