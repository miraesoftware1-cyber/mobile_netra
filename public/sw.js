const CACHE_NAME = 'netra-v3';

// 아이콘·매니페스트만 사전 캐시한다. HTML 페이지는 빌드마다 CSS/JS 해시가 바뀌므로
// 여기에 포함하면 구버전 HTML이 없어진 CSS를 참조해 스타일이 깨진다.
const STATIC_ASSETS = [
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

  if (!['http:', 'https:'].includes(url.protocol)) return;

  // Next.js 빌드 청크(/_next/)와 API는 SW가 관여하지 않는다
  if (url.pathname.startsWith('/_next/')) return;
  if (url.pathname.startsWith('/api/')) return;

  // 페이지 탐색(HTML)은 네트워크 우선 — 빌드 후 CSS 해시가 바뀌어도 항상 최신 HTML을 가져온다.
  // 오프라인일 때만 캐시 폴백.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached ?? Response.error();
        })
    );
    return;
  }

  // 정적 에셋(아이콘, 폰트 등)은 캐시 우선, 백그라운드에서 갱신
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
