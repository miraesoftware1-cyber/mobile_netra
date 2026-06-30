"use client";

import { useRouter } from "next/navigation";
import { User, Building2, LogOut, Type, IdCard, Atom } from "lucide-react";
import { useAuthStore } from "@/features/auth/hooks/use-auth-store";
import { Button } from "@/components/ui/button";
import {
  useFontSizeStore,
  FONT_SIZE_LABELS,
  FONT_SIZE_OPTIONS,
  type FontSize,
} from "@/features/settings/hooks/use-font-size-store";

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const fontSize = useFontSizeStore((s) => s.fontSize);
  const setFontSize = useFontSizeStore((s) => s.setFontSize);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 z-10 border-b border-gray-100 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-gray-900">내 정보</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      {/* 프로필 카드 */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full border-2 border-gray-100 bg-gray-50 flex items-center justify-center flex-shrink-0">
            <IdCard className="w-8 h-8 text-gray-400" />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 truncate">
                {user?.corp_name ?? "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Atom className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 truncate">
                {user?.dpt_name ?? "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-900 truncate">
                {user?.emp_name ?? "-"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 설정 메뉴 */}
      <div className="mx-4 mt-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* 글씨 크기 설정 */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-50">
            <Type className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-700">글씨 크기</span>
            <div className="flex items-center gap-1">
              {FONT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    fontSize === size
                      ? "bg-primary text-white"
                      : "bg-gray-100 text-gray-500 active:bg-gray-200"
                  }`}
                >
                  {FONT_SIZE_LABELS[size]}
                </button>
              ))}
            </div>
          </div>

          {/* 앱 버전 */}
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="text-lg w-5 text-center">📱</span>
            <span className="flex-1 text-sm text-gray-700">앱 버전</span>
            <span className="text-xs text-gray-400">v1.0.0</span>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-4 mb-4">
        <Button
          variant="outline"
          className="w-full h-12 text-red-500 border-red-100 hover:bg-red-50 hover:text-red-600 gap-2"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </Button>
      </div>
      </div>
    </div>
  );
}
