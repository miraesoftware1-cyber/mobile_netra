const CACHE_NAME = 'netra-v2';

const STATIC_ASSETS = [
  '/',
  '/menu',
  '/calendar',
  '/profile',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // http/https 외 스킴(chrome-extension 등)은 캐시 불가
  if (!['http:', 'https:'].includes(url.protocol)) return;

  // Next.js 빌드 청크는 캐시하지 않음 (빌드마다 해시가 바뀌어 스테일 캐시 충돌 발생)
  if (url.pathname.startsWith('/_next/')) return;

  // API 요청은 캐시하지 않음
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached ?? networkFetch;
    })
  );
});
