/* Service Worker — 让题库应用真正离线可用 */
const CACHE_NAME = 'question-bank-v18';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/theme.css',
  './assets/css/views.css',
  './assets/js/app.js',
  './assets/js/store.js',
  './assets/js/util.js',
  './assets/js/algo.js',
  './assets/js/ai.js',
  './assets/js/mentor.js',
  './assets/js/pdf-import.js',
  './assets/js/seed.js',
  './assets/js/splash.js',
  './assets/js/glow.js',
  './assets/js/views/home.js',
  './assets/js/views/bank.js',
  './assets/js/views/practice.js',
  './assets/js/views/exam.js',
  './assets/js/views/paper.js',
  './assets/js/views/import.js',
  './assets/js/views/kb.js',
  './assets/js/views/settings.js',
  './assets/js/views/misc.js',
  './assets/js/views/stats.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* file:// 协议下 SW 不可用，这里只在 http/https 下生效；
   file:// 打开时浏览器本身会缓存（localStorage + 资源缓存），离线照样能用 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
