'use client';

import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((err) => console.error('Service worker registration failed:', err));
    }

    // JS 청크 로드 실패 시 자동 새로고침 (서버 재빌드 후 구버전 캐시 문제)
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const err = event.reason;
      if (!err) return;
      const isChunkError =
        err.name === 'ChunkLoadError' ||
        (typeof err.message === 'string' && /loading chunk|failed to fetch dynamically imported module/i.test(err.message));
      if (isChunkError) {
        window.location.reload();
      }
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  return null;
}
