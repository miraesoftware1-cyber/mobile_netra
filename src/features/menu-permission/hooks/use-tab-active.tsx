'use client';

// mobile-netra는 탭 워크스페이스가 없으므로 항상 활성 상태로 반환
export function useIsTabActive(): boolean {
  return true;
}
