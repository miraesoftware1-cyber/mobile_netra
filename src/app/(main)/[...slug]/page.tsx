"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, Construction } from "lucide-react";

export default function NotReadyPage() {
  const router = useRouter();

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col bg-white">
      <header className="sticky top-0 z-10 flex-shrink-0 border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Construction className="w-8 h-8 text-gray-400" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-gray-800">아직 준비되지 않았습니다</p>
          <p className="text-sm text-gray-400">해당 메뉴는 현재 개발 중입니다</p>
        </div>
      </div>
    </div>
  );
}
