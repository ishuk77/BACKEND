const CACHE_NAME = 'avec-microcredit-cache-v23';
const ASSETS = [
  '.',
  'index.html',
  'admin.html',
  'news.html',
  'style.css',
  'script.js',
  'admin.js',
  'news.js',
  'home-news.js',
  'platform.html',
  'platform.js',
  'manifest.json',
  'icon.svg',
  'data.js',
  'momo-countries.js'
];
const APP_SHELL_PATHS = new Set(ASSETS.map(asset => new URL(asset, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const isAppShellRequest = requestUrl.origin === self.location.origin
    && (event.request.mode === 'navigate' || APP_SHELL_PATHS.has(requestUrl.pathname));
  if (!isAppShellRequest) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response.ok) {
          return response;
        }
        const cachedResponse = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, cachedResponse)).catch(() => {}));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
