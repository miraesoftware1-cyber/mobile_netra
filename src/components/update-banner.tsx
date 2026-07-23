"use client";

import { useUpdateChecker } from "@/hooks/use-update-checker";
import { RefreshCw } from "lucide-react";

export function UpdateBanner() {
  const updateAvailable = useUpdateChecker();

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6">
      {/* 전체 차단 오버레이 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 배너 카드 */}
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl px-6 py-6 flex flex-col items-center gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <RefreshCw className="w-7 h-7 text-primary" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">업데이트가 있습니다</p>
          <p className="text-sm text-gray-500 mt-1">새로운 버전이 배포되었습니다.<br />새로고침 후 계속 이용하실 수 있습니다.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full h-12 bg-primary text-white text-sm font-semibold rounded-xl active:bg-primary/90"
        >
          새로고침
        </button>
      </div>
    </div>
  );
}
