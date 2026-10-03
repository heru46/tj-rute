// App shell: network-first (selalu versi terbaru saat online, cache saat offline).
// Data jaringan: stale-while-revalidate (tampil cepat, diperbarui di latar).
const VERSION = 'tj-rute-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/app.js',
  'src/router.js',
  'src/geo.js',
  'src/fare.js',
  'src/search.js',
  'src/map.js',
  'src/results.js',
  'src/format.js',
  'src/polyline.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/fonts/fonts.css',
  'vendor/fonts/Archivo-600-800.woff2',
  'vendor/fonts/AtkinsonHyperlegible-400.woff2',
  'vendor/fonts/AtkinsonHyperlegible-700.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
];
const DATA = ['data/network.json', 'data/shapes.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([...SHELL, ...DATA])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const path = url.pathname;
  if (DATA.some((d) => path.endsWith(d))) {
    e.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(e.request);
        const fresh = fetch(e.request)
          .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
          .catch(() => cached);
        return cached || fresh;
      }),
    );
    return;
  }
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      fetch(e.request)
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cache.match(e.request, { ignoreSearch: true })),
    ),
  );
});
